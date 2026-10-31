/* ===========================================================
   Relay — views
   -----------------------------------------------------------
   The whole site is one document, so it survives being written
   into about:blank where there are no page loads, no relative
   paths and no query string to read.
   =========================================================== */

(function (FP) {
  "use strict";

  var started = {};   /* a view's controller is started the first time it shows */

  var router = {
    current: "home",

    show: function (name, arg) {
      var view = document.getElementById("view-" + name);
      if (!view) return;

      Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) {
        v.hidden = v !== view;
      });
      document.body.setAttribute("data-view", name);
      router.current = name;

      /* lazy start, then let the view refresh itself */
      var ctrl = FP[name];
      if (ctrl && ctrl.init && !started[name]) { started[name] = true; ctrl.init(); }
      if (ctrl && ctrl.enter) ctrl.enter(arg);

      /* keep the address bar honest when the site is hosted normally;
         inside about:blank this throws and is skipped. */
      if (name === "home") {
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      }
      window.scrollTo(0, 0);
    },

    /* Open a page in the viewport, a new tab, or a blank window,
       whichever the settings ask for. */
    open: function (url, mode) {
      mode = mode || FP.store.get("mode");
      var where = FP.store.get("openIn");
      if (where === "tab" || where === "blank") {
        FP.shell.spawn(url, mode, where);
        return;
      }
      router.show("browse", { url: url, mode: mode });
    },

    wire: function () {
      /* any element with data-view="x" switches to that view */
      document.addEventListener("click", function (e) {
        var el = e.target.closest ? e.target.closest("[data-view]") : null;
        /* body carries the current view as state, not as a link */
        if (!el || el === document.body || el === document.documentElement) return;
        e.preventDefault();
        router.show(el.getAttribute("data-view"), el.getAttribute("data-arg") || null);
      });
    }
  };

  FP.router = router;
})(window.FP = window.FP || {});
