/* ===========================================================
   Relay — the tiles under the search bar
   Edit this list for new defaults, or change them in Settings.
   =========================================================== */

(function (FP) {
  "use strict";

  FP.DEFAULT_SHORTCUTS = [
    { id: "yt",   label: "YouTube",   url: "https://www.youtube.com" },
    { id: "wiki", label: "Wikipedia", url: "https://en.wikipedia.org" },
    { id: "gh",   label: "GitHub",    url: "https://github.com" },
    { id: "rd",   label: "Reddit",    url: "https://www.reddit.com" },
    { id: "hn",   label: "Hacker News", url: "https://news.ycombinator.com" },
    { id: "ddg",  label: "DuckDuckGo", url: "https://duckduckgo.com" },
    { id: "arch", label: "Archive",   url: "https://archive.org" },
    { id: "wthr", label: "Weather",   url: "https://wttr.in" },
    { id: "nasa", label: "NASA",      url: "https://www.nasa.gov" },
    { id: "gnow", label: "GeForce Now", url: "https://play.geforcenow.com" },
    { id: "nowgg", label: "now.gg",   url: "https://now.gg" }
  ];

  FP.defaultShortcuts = function () {
    return FP.DEFAULT_SHORTCUTS.map(function (t) { return Object.assign({}, t); });
  };

  /* Tile face: a site icon when the network allows it, the first
     letter when it doesn't. */
  FP.tileIcon = function (url) {
    try {
      return "https://icons.duckduckgo.com/ip3/" + new URL(url).host + ".ico";
    } catch (e) { return ""; }
  };
})(window.FP = window.FP || {});
