/* ===========================================================
   Relay — proxy mode (Ultraviolet)
   -----------------------------------------------------------
   The other modes fetch a page's HTML and rewrite it once. This
   one puts a service worker between the proxied site and the
   network, so the site keeps running: its scripts execute, its
   XHR and fetch calls go through the proxy, its images and fonts
   and video come through, logins hold, WebSockets work.

   It needs two things the others don't:
     - a real origin (https, or localhost). A document written
       into about:blank cannot register a service worker.
     - a Wisp server to carry the traffic. server/ has one, and
       it is the only part that has to run on a host.
   =========================================================== */

(function (FP) {
  "use strict";

  var ready = null;      /* promise: service worker + transport are up */
  var connection = null;

  var uv = {

    /* Can this window run proxy mode at all? */
    available: function () {
      if (!("serviceWorker" in navigator)) return false;
      if (!window.isSecureContext) return false;
      if (!/^https?:$/.test(location.protocol)) return false;
      /* A document written into a blank window inherits its opener's
         origin, so the checks above all pass — but it has no document
         of its own to attach a worker to, and registering throws.
         document.URL still says about:blank, which is the giveaway. */
      if (/^about:/i.test(document.URL || "")) return false;
      return true;
    },

    why: function () {
      if (!("serviceWorker" in navigator)) return "This browser has no service workers.";
      if (!window.isSecureContext) return "Proxy mode needs https (or localhost).";
      if (!/^https?:$/.test(location.protocol) || /^about:/i.test(document.URL || "")) {
        return "Proxy mode needs the site open at its real address. Inside a blank window there is " +
               "nowhere to register the service worker — point your launcher's frame at the hosted " +
               "site and proxy mode works there.";
      }
      return "Proxy mode is not available here.";
    },

    wispUrl: function () {
      var set = (FP.store.get("wisp") || "").trim();
      if (set) return set;
      /* same host by default: handy when the site is served by server/ itself */
      return (location.protocol === "https:" ? "wss://" : "ws://") + location.host +
             (location.pathname.replace(/[^/]*$/, "")) + "wisp/";
    },

    /* where our own files live, whatever subpath the site is on */
    assetBase: function () {
      return location.pathname.replace(/[^/]*$/, "");
    },

    /* Load uv.bundle + uv.config into this page, register the worker,
       then point bare-mux at the Wisp server. Runs once. */
    start: function () {
      if (ready) return ready;

      ready = (function () {
        var base = uv.assetBase();

        function script(src) {
          return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) { resolve(); return; }
            var el = document.createElement("script");
            el.src = src;
            el.onload = function () { resolve(); };
            el.onerror = function () { reject(new Error("could not load " + src)); };
            document.head.appendChild(el);
          });
        }

        return script(base + "uv/uv.bundle.js")
          .then(function () { return script(base + "uv/uv.config.js"); })
          .then(function () { return script(base + "baremux/index.js"); })
          .then(function () {
            /* scope is the whole site, not just the proxy prefix: an
               absolute link inside a proxied page has to land back in
               the worker rather than on this site's own 404 */
            return navigator.serviceWorker.register(base + "sw.js", { scope: base });
          })
          .then(function (reg) {
            /* wait until it is actually controlling, or the first
               frame load races the worker and comes back blank */
            if (reg.active && navigator.serviceWorker.controller) return reg;
            return new Promise(function (resolve) {
              var done = function () { resolve(reg); };
              if (reg.installing || reg.waiting) {
                var w = reg.installing || reg.waiting;
                w.addEventListener("statechange", function () {
                  if (w.state === "activated") done();
                });
              }
              navigator.serviceWorker.addEventListener("controllerchange", done);
              setTimeout(done, 4000);
            });
          })
          .then(function () { return uv.checkBackend(); })
          .then(function () {
            connection = new window.BareMux.BareMuxConnection(base + "baremux/worker.js");
            return uv.applyTransport();
          })
          .then(function () { return true; });
      })().catch(function (err) {
        ready = null;              /* let the next attempt try again */
        throw err;
      });

      return ready;
    },

    /* The address to put in the frame. */
    frameUrl: function (url) {
      return window.__uv$config.prefix + window.__uv$config.encodeUrl(url);
    },

    /* Read the real address back out of a proxied frame URL. */
    realUrl: function (frameUrl) {
      try {
        var path = new URL(frameUrl, location.href).pathname;
        var prefix = window.__uv$config.prefix;
        if (path.indexOf(prefix) !== 0) return "";
        return window.__uv$config.decodeUrl(path.slice(prefix.length));
      } catch (e) { return ""; }
    },

    /* Two transports, because they break in different places.
       Epoxy speaks raw TCP over Wisp and handles WebSockets, which
       sites with live content need. Bare lets the server's own HTTP
       client do the work, which is steadier on ordinary page loads.
       Both come from the same server. */
    applyTransport: function () {
      if (!connection) return Promise.resolve();
      var base = uv.assetBase();
      if (FP.store.get("transport") === "bare") {
        return connection.setTransport(base + "baremod/index.mjs", [uv.bareUrl()]);
      }
      return connection.setTransport(base + "epoxy/index.mjs", [{ wisp: uv.wispUrl() }]);
    },

    /* A proxy needs something to do the fetching. Ask it who it is
       before handing it traffic, so a missing backend reads as
       "set this up" rather than a page that never loads. */
    checkBackend: function () {
      if (FP.store.get("transport") !== "bare") return Promise.resolve();
      var url = uv.bareUrl();
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);

      return fetch(url, { signal: ctrl ? ctrl.signal : undefined })
        .then(function (res) { return res.json(); })
        .then(function (info) {
          clearTimeout(timer);
          if (!info || !info.versions || info.versions.indexOf("v3") < 0) {
            throw new Error("NO_BACKEND");
          }
        })
        .catch(function () {
          clearTimeout(timer);
          throw new Error("NO_BACKEND");
        });
    },

    bareUrl: function () {
      var set = (FP.store.get("bare") || "").trim();
      if (set) return set;
      return location.origin + uv.assetBase() + "bare/";
    },

    /* Switch transport or server without reloading. */
    retransport: function () { return uv.applyTransport(); }
  };

  FP.uv = uv;
})(window.FP = window.FP || {});
