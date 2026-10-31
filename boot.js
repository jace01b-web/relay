/* ===========================================================
   Relay — start up
   Runs last. Works the same whether the files are served from a
   host or written straight into an about:blank document.
   =========================================================== */

(function (FP) {
  "use strict";

  /* the icon travels with the document, so there is no file to fetch */
  FP.ICON = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#140a20"/>' +
    '<circle cx="32" cy="40" r="5" fill="#ff9a4d"/>' +
    '<path d="M32 35V14" stroke="#ff9a4d" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M20 22a17 17 0 0 1 24 0" stroke="#7ee0b8" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M13 13a26 26 0 0 1 38 0" stroke="#7ee0b8" stroke-width="3" fill="none" stroke-linecap="round" opacity=".45"/>' +
    "</svg>"
  );

  FP.router.wire();
  FP.shell.boot();

  /* A copy opened in a new tab or blank window is told where to go. */
  var seed = window.FP_BOOT;
  if (seed && seed.url) {
    FP.router.show("browse", { url: seed.url, mode: seed.mode });
  } else {
    /* When the site is hosted normally, a shared ?url= link still works. */
    var asked = "";
    try { asked = new URLSearchParams(location.search).get("url") || ""; } catch (e) {}
    if (asked) FP.router.show("browse", { url: asked, mode: FP.store.get("mode") });
    else FP.router.show("home");
  }

  /* keep the nav marks honest after every switch */
  var show = FP.router.show;
  FP.router.show = function (name, arg) {
    show(name, arg);
    FP.shell.markNav();
  };
  FP.shell.markNav();
})(window.FP);
