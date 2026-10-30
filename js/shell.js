/* ===========================================================
   Relay — shared shell: theme, tab appearance, toasts, panic key
   =========================================================== */

(function (FP) {
  "use strict";

  var shell = {

    /* Theme, density and tab appearance are applied on every page. */
    paint: function () {
      var s = FP.store.all();
      document.documentElement.setAttribute("data-theme", s.theme || "relay");
      document.documentElement.setAttribute("data-density", s.density || "comfortable");
      if (s.density === "compact") document.documentElement.style.fontSize = "14.5px";
      else document.documentElement.style.fontSize = "";

      if (s.tabTitle) document.title = s.tabTitle;
      var link = document.querySelector("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = s.tabIcon || FP.ICON;
    },

    markNav: function () {
      Array.prototype.forEach.call(document.querySelectorAll("a[data-view], button[data-view]"), function (el) {
        if (el.getAttribute("data-view") === FP.router.current) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      });
    },

    toast: function (text, kind) {
      var host = document.getElementById("toasts");
      if (!host) {
        host = document.createElement("div");
        host.id = "toasts";
        document.body.appendChild(host);
      }
      var el = document.createElement("div");
      el.className = "toast";
      el.setAttribute("data-kind", kind || "info");
      el.setAttribute("role", "status");
      el.textContent = text;
      host.appendChild(el);
      setTimeout(function () {
        el.style.transition = "opacity 200ms";
        el.style.opacity = "0";
        setTimeout(function () { el.remove(); }, 220);
      }, 3200);
    },

    /* One key sends the browser somewhere ordinary. */
    armPanic: function () {
      var key = FP.store.get("panicKey");
      if (!key) return;
      window.addEventListener("keydown", function (e) {
        if (e.key !== key) return;
        var tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        shell.panic();
      });
    },

    panic: function () {
      var to = FP.store.get("panicUrl") || "https://www.google.com";
      try { location.replace(to); } catch (e) { location.href = to; }
    },

    /* Latency -> 0..4 signal bars */
    level: function (ms) {
      if (ms == null || ms < 0) return 0;
      if (ms < 700) return 4;
      if (ms < 1500) return 3;
      if (ms < 3000) return 2;
      return 1;
    },

    bars: function (ms) {
      return '<span class="bars" data-level="' + shell.level(ms) + '" aria-hidden="true">' +
        "<i></i><i></i><i></i><i></i></span>";
    },

    pingText: function (entry) {
      if (!entry) return "untested";
      if (entry.ms < 0) return "no answer";
      return entry.ms + " ms";
    },

    /* Open the app again in a new tab or a blank window.
       There is no URL to point at when we are running inside
       about:blank, so the whole document is copied across and told
       which page to open. */
    spawn: function (url, mode, where) {
      var win = window.open("about:blank", "_blank");
      if (!win) {
        shell.toast("Your browser blocked the new window. Allow pop-ups here.", "bad");
        FP.router.show("browse", { url: url, mode: mode });
        return null;
      }

      var s = FP.store.all();
      var boot = "<script>window.FP_BOOT=" +
        JSON.stringify({ url: url, mode: mode }).replace(/</g, "\\u003c") + ";<\/script>";

      /* when the site is hosted normally, relative paths in the copy
         need a base; inside about:blank everything is already inline */
      var base = "";
      if (/^https?:/i.test(location.href)) {
        base = '<base href="' + location.href.replace(/[^/]*$/, "") + '">';
      }

      var html = document.documentElement.outerHTML
        .replace(/<head([^>]*)>/i, "<head$1>" + base + boot);

      win.document.open();
      win.document.write("<!doctype html>" + html);
      win.document.close();

      try {
        win.document.title = s.tabTitle || document.title;
      } catch (e) {}
      return win;
    },

    /* Where a launch should go, given the current setting. */
    launch: function (url, mode) {
      FP.router.open(url, mode);
    },

    boot: function () {
      shell.paint();
      shell.markNav();
      shell.armPanic();
    }
  };

  FP.shell = shell;
})(window.FP = window.FP || {});
