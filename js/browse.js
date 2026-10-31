/* ===========================================================
   Relay — viewport page
   =========================================================== */

(function (FP) {
  "use strict";

  var store = FP.store, engine = FP.engine, shell = FP.shell;

  var el = {
    frame: document.getElementById("frame"),
    addrForm: document.getElementById("addr-form"),
    addr: document.getElementById("view-addr"),
    mode: document.getElementById("view-mode"),
    via: document.getElementById("via"),
    bars: document.getElementById("bars"),
    back: document.getElementById("back"),
    forward: document.getElementById("forward"),
    reload: document.getElementById("reload"),
    blank: document.getElementById("open-blank"),
    busy: document.getElementById("busy"),
    busyHead: document.getElementById("busy-head"),
    busySub: document.getElementById("busy-sub"),
    failed: document.getElementById("failed"),
    failHead: document.getElementById("fail-head"),
    failSub: document.getElementById("fail-sub"),
    failTrace: document.getElementById("fail-trace"),
    retry: document.getElementById("retry"),
    tryReader: document.getElementById("try-reader")
  };

  var stack = [];      /* own history, so the frame cannot rewrite it */
  var at = -1;
  var current = "";
  var mode = "page";
  var inFlight = 0;

  function show(which) {
    el.busy.setAttribute("data-show", which === "busy" ? "1" : "0");
    el.failed.setAttribute("data-show", which === "failed" ? "1" : "0");
  }

  function setArrows() {
    el.back.disabled = at <= 0;
    el.forward.disabled = at >= stack.length - 1;
  }

  /* ---------- the one job ---------- */

  function go(url, pushState) {
    if (!url) return;
    current = url;
    el.addr.value = url;
    document.title = (store.get("tabTitle") || engine.host(url) + " — Relay");

    if (pushState !== false) {
      stack = stack.slice(0, at + 1);
      stack.push(url);
      at = stack.length - 1;
    }
    setArrows();

    /* say so before the wait, not after it */
    if (engine.isAppSite(url) && mode !== "frame") {
      shell.toast(engine.host(url) + " is a JavaScript app — a text relay cannot run it. Proxy-instance mode is the only one that can.", "bad");
    }

    var ticket = ++inFlight;
    show("busy");
    el.busyHead.textContent = "Reaching the relay";
    el.busySub.textContent = engine.host(url);
    el.via.textContent = "…";
    el.bars.setAttribute("data-level", "0");

    FP.onAttempt = function (relay, n, total) {
      if (ticket !== inFlight) return;
      el.busyHead.textContent = "Asking " + relay.name;
      el.busySub.textContent = "relay " + n + " of " + total + " · " + engine.host(url);
    };

    /* proxy mode: the service worker does the work and the page
       stays live, so we hand the frame a URL and get out of the way */
    if (mode === "proxy" && !FP.uv.available()) {
      /* a blank window has nowhere to register a service worker, so
         carry on with the rewriting mode rather than dead-ending */
      mode = "page";
      el.mode.value = "page";
      shell.toast("Proxy mode needs the hosted site; using full page here.", "info");
    }

    if (mode === "proxy") {
      el.busyHead.textContent = "Starting the proxy";
      el.busySub.textContent = "service worker and transport";
      el.via.textContent = "proxy";

      FP.uv.start().then(function () {
        if (ticket !== inFlight) return;
        el.frame.removeAttribute("srcdoc");
        el.frame.removeAttribute("sandbox");     /* the page has to really run */
        el.frame.src = FP.uv.frameUrl(url);
        el.bars.setAttribute("data-level", "4");
        el.via.textContent = "proxy · " + (store.get("wisp") ? "your wisp" : "this host");
        watchFrame(ticket);
        store.pushHistory(url, engine.host(url));
      }).catch(function (err) {
        if (ticket !== inFlight) return;
        var why = (err && err.message) || "";

        /* A window that cannot hold a service worker — a blank window
           written in by a launcher, most often — can still browse with
           the rewriting mode, so fall back rather than dead-end. */
        if (/NO_BACKEND/.test(why)) {
          fail({
            message: "Proxy mode needs a backend — about two minutes, no commands.",
            hint: "1. dash.cloudflare.com → Workers & Pages → Create → Worker\n" +
                  "2. Deploy it, then Edit code\n" +
                  "3. Paste in worker/bare-worker.js from this repo, Deploy again\n" +
                  "4. Settings → Connection → Bare server: https://<your-worker>.workers.dev/bare/\n\n" +
                  "Until then, full page and reader modes work with no setup at all.",
            attempts: []
          });
          return;
        }

        if (/ServiceWorker|invalid state|secure context|not supported/i.test(why)) {
          mode = "page";
          el.mode.value = "page";
          shell.toast("Proxy mode needs the hosted site; using full page here.", "info");
          go(url, false);
          return;
        }

        fail({
          message: "The proxy could not start.",
          hint: (why ? why + ". " : "") +
                "Check the transport in Settings — the Wisp or Bare server has to be reachable from here.",
          attempts: []
        });
      });
      return;
    }

    /* proxy-instance mode hands the whole job to a full proxy server */
    if (mode === "frame") {
      var frameRelay = store.enabledRelays().filter(function (r) { return r.kind === "frame"; })[0];
      if (!frameRelay) {
        fail({
          message: "No proxy instance is set up.",
          hint: "Add a relay of type \"proxy instance\" in Settings — the address of a web-proxy server, with %URL% where the target goes.",
          attempts: []
        });
        return;
      }
      el.frame.removeAttribute("srcdoc");
      el.frame.src = engine.build(frameRelay, url);
      el.via.textContent = frameRelay.name;
      el.bars.setAttribute("data-level", "4");
      setTimeout(function () { if (ticket === inFlight) show("none"); }, 900);
      store.pushHistory(url, engine.host(url));
      return;
    }

    engine.load(url, mode).then(function (out) {
      if (ticket !== inFlight) return;

      var html;
      if (mode === "reader" || out.kind === "reader") {
        html = out.kind === "reader"
          ? engine.textDocument(out.body, url)
          : engine.reader(out.body, url, out.relay);
      } else {
        html = engine.rewrite(out.body, url, out.relay, {
          stripScripts: store.get("stripScripts"),
          blockImages: store.get("blockImages"),
          assets: store.get("assets")
        });
      }

      el.frame.removeAttribute("src");
      el.frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox");
      el.frame.srcdoc = html;

      el.via.textContent = out.relay.name + " · " + out.ms + " ms";
      el.bars.setAttribute("data-level", shell.level(out.ms));
      show("none");

      var title = engine.title(out.body) || engine.host(url);
      store.pushHistory(url, title);
      if (!store.get("tabTitle")) document.title = title + " — Relay";

      if (out.attempts && out.attempts.length) {
        shell.toast(out.attempts.length + " relay" + (out.attempts.length > 1 ? "s" : "") +
          " failed first; served by " + out.relay.name, "info");
      }
    }).catch(function (err) {
      if (ticket !== inFlight) return;
      fail(err);
    });
  }

  function fail(err) {
    show("failed");
    el.via.textContent = "no route";
    el.bars.setAttribute("data-level", "0");
    el.failHead.textContent = (err && err.message) || "The page did not come through";
    el.failSub.textContent = (err && err.hint) || "";
    var lines = (err && err.attempts || []).map(function (a) {
      return a.relay + " — " + a.why;
    });
    el.failTrace.textContent = lines.length ? lines.join("\n") : "No relay was tried.";
    el.failTrace.style.display = lines.length ? "" : "none";
  }

  /* In proxy mode the frame navigates on its own, so the address bar
     follows it instead of the shell driving every hop. */
  function watchFrame(ticket) {
    var seen = 0;
    var tick = setInterval(function () {
      if (ticket !== inFlight) { clearInterval(tick); return; }
      var here = "";
      try { here = el.frame.contentWindow.location.href; } catch (e) { return; }
      if (!here || here === "about:blank") return;
      var real = FP.uv.realUrl(here);
      if (real && real !== current) {
        current = real;
        el.addr.value = real;
        document.title = (store.get("tabTitle") || engine.host(real) + " — Relay");
        store.pushHistory(real, engine.host(real));
      }
      if (++seen > 600) clearInterval(tick);   /* ten minutes is plenty */
    }, 500);

    el.frame.addEventListener("load", function once() {
      el.frame.removeEventListener("load", once);
      if (ticket === inFlight) show("none");
    });
    /* don't leave the spinner up if load never fires */
    setTimeout(function () { if (ticket === inFlight) show("none"); }, 6000);
  }

  /* ---------- messages from the sandboxed page ---------- */

  window.addEventListener("message", function (e) {
    if (!e.data || e.source !== el.frame.contentWindow) return;
    var msg = e.data;
    if (msg.rl === "navigate" && msg.url) {
      var next = engine.resolve(msg.url, current);
      if (!next) return;
      if (msg.newTab) shell.spawn(next, mode, "tab");
      else go(next);
    } else if (msg.rl === "url" && msg.url) {
      /* the page moved itself with history.pushState */
      current = msg.url;
      el.addr.value = msg.url;
    } else if (msg.rl === "notice") {
      shell.toast(msg.text, "bad");
    } else if (msg.rl === "key") {
      if (msg.key === store.get("panicKey")) shell.panic();
    }
  });

  /* ---------- controls ---------- */

  el.addrForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var url = engine.normalize(el.addr.value);
    if (!url) { shell.toast("That address could not be read.", "bad"); return; }
    go(url);
  });

  el.back.addEventListener("click", function () {
    if (mode === "proxy") {
      try { el.frame.contentWindow.history.back(); return; } catch (e) {}
    }
    if (at <= 0) return;
    at--;
    go(stack[at], false);
  });

  el.forward.addEventListener("click", function () {
    if (mode === "proxy") {
      try { el.frame.contentWindow.history.forward(); return; } catch (e) {}
    }
    if (at >= stack.length - 1) return;
    at++;
    go(stack[at], false);
  });

  el.reload.addEventListener("click", function () {
    if (mode === "proxy") {
      try { el.frame.contentWindow.location.reload(); return; } catch (e) {}
    }
    if (current) go(current, false);
  });

  el.retry.addEventListener("click", function () { if (current) go(current, false); });

  el.tryReader.addEventListener("click", function () {
    mode = "reader";
    el.mode.value = "reader";
    if (current) go(current, false);
  });

  el.mode.addEventListener("change", function () {
    mode = el.mode.value;
    store.set("mode", mode);
    if (current) go(current, false);
  });

  el.blank.addEventListener("click", function () {
    if (!current) return;
    shell.spawn(current, mode, "blank");
  });

  /* ---------- view ---------- */

  FP.browse = {
    init: function () { /* listeners above are wired once at load */ },

    /* the launcher hands over an address and a mode */
    enter: function (arg) {
      if (!arg || !arg.url) {
        if (current) return;            /* reopened with nothing new: keep the page */
        show("failed");
        el.failHead.textContent = "No address given";
        el.failSub.textContent = "Go back and type where you want to go.";
        el.failTrace.style.display = "none";
        return;
      }
      mode = arg.mode || store.get("mode");
      el.mode.value = mode;
      stack = []; at = -1;
      go(engine.normalize(arg.url));
    }
  };
})(window.FP);
