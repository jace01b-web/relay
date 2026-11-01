/* ===========================================================
   Relay — settings + history, saved in this browser only
   =========================================================== */

(function (FP) {
  "use strict";

  var KEY = "relay.settings.v1";
  var HKEY = "relay.history.v1";

  var DEFAULTS = {
    /* connection */
    relays: null,                 /* filled from FP.defaultRelays() on first run */
    activeRelay: "auto",          /* relay id, or "auto" for fastest-first */
    failover: true,
    timeout: 12000,
    mode: "page",                 /* page (no setup) | proxy (needs a backend) | reader | frame */
    wisp: "",                     /* wss://your-host/wisp/  (blank = this host) */
    bare: "",                     /* https://your-host/bare/ (blank = this host) */
    transport: "bare",            /* bare (verified: pages + links) | epoxy (adds WebSockets) */

    /* browsing */
    searchEngine: "https://duckduckgo.com/?q=%s",
    stripScripts: false,
    blockImages: false,
    assets: "direct",             /* direct | relay — where images and CSS come from */
    openIn: "same",               /* same | tab | blank  (blank = about:blank window) */
    keepHistory: true,

    /* appearance */
    theme: "opium",               /* opium | strawberri | console */
    density: "comfortable",       /* comfortable | compact */
    wordmark: "relay",
    tagline: "free relays, no account",
    decor: "auto",                /* auto (seasonal) | on | off */
    shortcuts: null,              /* filled from FP.defaultShortcuts() on first run */

    /* tab + escape */
    tabTitle: "",
    tabIcon: "",
    panicKey: "Escape",
    panicUrl: "https://www.google.com"
  };

  var cache = null;
  var listeners = [];

  /* ---------- where settings can live ----------
     Written into about:blank the document may have an opaque origin,
     where localStorage throws. Fall back to the window that opened
     us (same origin, so its storage is reachable), then to memory —
     the app keeps working either way, it just forgets on close. */

  var memory = {};

  var backing = (function () {
    function usable(store) {
      try {
        if (!store) return false;
        var probe = "relay.probe";
        store.setItem(probe, "1");
        store.removeItem(probe);
        return true;
      } catch (e) { return false; }
    }

    try { if (usable(window.localStorage)) return window.localStorage; } catch (e) {}
    try { if (window.opener && usable(window.opener.localStorage)) return window.opener.localStorage; } catch (e) {}
    try { if (window.parent !== window && usable(window.parent.localStorage)) return window.parent.localStorage; } catch (e) {}

    return {
      persistent: false,
      getItem: function (k) { return k in memory ? memory[k] : null; },
      setItem: function (k, v) { memory[k] = String(v); },
      removeItem: function (k) { delete memory[k]; }
    };
  })();

  function read(key, fallback) {
    try {
      var raw = backing.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { backing.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var store = {
    all: function () {
      if (!cache) {
        cache = Object.assign({}, DEFAULTS, read(KEY, {}));
        if (!Array.isArray(cache.relays) || !cache.relays.length) {
          cache.relays = FP.defaultRelays();
        }
        if (!Array.isArray(cache.shortcuts)) {
          cache.shortcuts = FP.defaultShortcuts();
        }
      }
      return cache;
    },

    /* ---------- shortcut tiles ---------- */

    shortcuts: function () { return store.all().shortcuts; },

    saveShortcuts: function (list) { return store.set("shortcuts", list); },

    upsertShortcut: function (tile) {
      var list = store.shortcuts().slice();
      var at = -1;
      list.forEach(function (t, i) { if (t.id === tile.id) at = i; });
      if (at >= 0) list[at] = Object.assign({}, list[at], tile);
      else list.push(tile);
      return store.saveShortcuts(list);
    },

    removeShortcut: function (id) {
      return store.saveShortcuts(store.shortcuts().filter(function (t) { return t.id !== id; }));
    },

    moveShortcut: function (id, delta) {
      var list = store.shortcuts().slice();
      var at = -1;
      list.forEach(function (t, i) { if (t.id === id) at = i; });
      var to = at + delta;
      if (at < 0 || to < 0 || to >= list.length) return list;
      list.splice(to, 0, list.splice(at, 1)[0]);
      return store.saveShortcuts(list);
    },

    restoreShortcuts: function () { return store.saveShortcuts(FP.defaultShortcuts()); },

    get: function (key) { return store.all()[key]; },

    set: function (key, value) {
      var s = store.all();
      s[key] = value;
      write(KEY, s);
      listeners.forEach(function (fn) { try { fn(key, value, s); } catch (e) {} });
      return value;
    },

    patch: function (obj) {
      Object.keys(obj).forEach(function (k) { store.set(k, obj[k]); });
    },

    onChange: function (fn) { listeners.push(fn); },

    reset: function () {
      try { backing.removeItem(KEY); } catch (e) {}
      cache = null;
      return store.all();
    },

    /* ---------- relays ---------- */

    relays: function () { return store.all().relays; },

    enabledRelays: function () {
      return store.relays().filter(function (r) { return r.enabled; });
    },

    relay: function (id) {
      return store.relays().filter(function (r) { return r.id === id; })[0] || null;
    },

    saveRelays: function (list) { return store.set("relays", list); },

    upsertRelay: function (relay) {
      var list = store.relays().slice();
      var at = -1;
      list.forEach(function (r, i) { if (r.id === relay.id) at = i; });
      if (at >= 0) list[at] = Object.assign({}, list[at], relay);
      else list.push(relay);
      return store.saveRelays(list);
    },

    removeRelay: function (id) {
      var list = store.relays().filter(function (r) { return r.id !== id; });
      if (store.get("activeRelay") === id) store.set("activeRelay", "auto");
      return store.saveRelays(list);
    },

    moveRelay: function (id, delta) {
      var list = store.relays().slice();
      var at = -1;
      list.forEach(function (r, i) { if (r.id === id) at = i; });
      var to = at + delta;
      if (at < 0 || to < 0 || to >= list.length) return list;
      var item = list.splice(at, 1)[0];
      list.splice(to, 0, item);
      return store.saveRelays(list);
    },

    restoreRelays: function () {
      var custom = store.relays().filter(function (r) { return !r.builtin; });
      return store.saveRelays(FP.defaultRelays().concat(custom));
    },

    /* ---------- measured latency, kept separately ---------- */

    pings: function () { return read("relay.pings.v1", {}); },

    setPing: function (id, ms) {
      var p = store.pings();
      p[id] = { ms: ms, at: Date.now() };
      write("relay.pings.v1", p);
      return p;
    },

    /* fastest enabled relay that can serve the given mode */
    fastest: function (mode) {
      var pings = store.pings();
      var list = store.enabledRelays().filter(function (r) {
        return FP.engine.supports(r, mode);
      });
      var scored = list.map(function (r, i) {
        var p = pings[r.id];
        var ms = p && p.ms > 0 ? p.ms : 9000 + i; /* untested keeps list order */
        return { relay: r, ms: ms };
      });
      scored.sort(function (a, b) { return a.ms - b.ms; });
      return scored.length ? scored[0].relay : null;
    },

    /* relays to try, in order, for one request */
    chain: function (mode) {
      var active = store.get("activeRelay");
      var pool = store.enabledRelays().filter(function (r) {
        return FP.engine.supports(r, mode);
      });
      var first = null;
      if (active !== "auto") {
        first = pool.filter(function (r) { return r.id === active; })[0] || null;
      }
      if (!first) first = store.fastest(mode);
      if (!first) return [];
      if (!store.get("failover")) return [first];
      var rest = pool.filter(function (r) { return r.id !== first.id; });
      var pings = store.pings();
      rest.sort(function (a, b) {
        var pa = pings[a.id] && pings[a.id].ms > 0 ? pings[a.id].ms : 9000;
        var pb = pings[b.id] && pings[b.id].ms > 0 ? pings[b.id].ms : 9000;
        return pa - pb;
      });
      return [first].concat(rest);
    },

    /* ---------- history ---------- */

    history: function () { return read(HKEY, []); },

    pushHistory: function (url, title) {
      if (!store.get("keepHistory")) return store.history();
      var list = store.history().filter(function (h) { return h.url !== url; });
      list.unshift({ url: url, title: title || "", at: Date.now() });
      list = list.slice(0, 40);
      write(HKEY, list);
      return list;
    },

    dropHistory: function (url) {
      var list = store.history().filter(function (h) { return h.url !== url; });
      write(HKEY, list);
      return list;
    },

    clearHistory: function () {
      try { backing.removeItem(HKEY); } catch (e) {}
      return [];
    },

    /* ---------- portable config ---------- */

    exportJson: function () {
      return JSON.stringify({
        kind: "relay-config",
        version: 1,
        exported: new Date().toISOString(),
        settings: store.all()
      }, null, 2);
    },

    importJson: function (text) {
      var data = JSON.parse(text);
      var incoming = data && data.settings ? data.settings : data;
      if (!incoming || typeof incoming !== "object") throw new Error("Not a Relay config file.");
      cache = Object.assign({}, DEFAULTS, incoming);
      if (!Array.isArray(cache.relays) || !cache.relays.length) cache.relays = FP.defaultRelays();
      if (!Array.isArray(cache.shortcuts)) cache.shortcuts = FP.defaultShortcuts();
      write(KEY, cache);
      return cache;
    },

    /* false when we are running on memory only */
    persists: function () { return backing.persistent !== false; },

    DEFAULTS: DEFAULTS
  };

  FP.store = store;
})(window.FP = window.FP || {});
