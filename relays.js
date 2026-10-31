/* ===========================================================
   Relay — the relay registry
   -----------------------------------------------------------
   Tested from a real browser on 2026-10-30. Most of the free
   public CORS proxies that existed a couple of years ago are
   gone: dead hosts, or an API key, or a short internal timeout
   that gives up on any page bigger than a few hundred KB.

   What survives is at the top. What needs a key, or has stopped
   answering, is kept below and switched off, with the reason
   written on it — so the list stays honest instead of failing
   silently six relays deep.

   The one that will not let you down is your own: worker/relay-worker.js
   puts a private relay on Cloudflare's free plan in about two
   minutes. Add it, drag it to the top, and the rest become backup.

   kind:
     raw    - returns the page bytes as-is            (best)
     json   - returns JSON, page body in .contents     (fallback)
     reader - returns plain text / markdown only       (reading)
     frame  - a full web-proxy instance you load in a frame
     direct - no relay at all
   template: %URL% is where the target address goes.
   encode:   true  -> percent-encoded into the template
             false -> appended verbatim
   =========================================================== */

(function (FP) {
  "use strict";

  FP.BUILTIN_RELAYS = [
    /* ---------- yours, once you put it up ---------- */
    {
      id: "my-worker",
      name: "My Worker",
      provider: "set this up — see worker/relay-worker.js",
      kind: "raw",
      template: "https://YOUR-WORKER.workers.dev/?url=%URL%",
      encode: true,
      note: "Your own relay on Cloudflare's free plan. No rate limit worth worrying about, no timeout, and it strips the headers that stop pages rendering. Edit this entry with your address and turn it on.",
      enabled: false,
      builtin: true
    },

    /* ---------- working public relays ---------- */
    {
      id: "allorigins-raw",
      name: "AllOrigins",
      provider: "allorigins.win",
      kind: "raw",
      template: "https://api.allorigins.win/raw?charset=UTF-8&url=%URL%",
      encode: true,
      note: "The last free one still answering. Rate-limits if you hit it fast, and gives up (408) on heavy pages.",
      enabled: true,
      builtin: true
    },
    {
      id: "allorigins-json",
      name: "AllOrigins (wrapped)",
      provider: "allorigins.win",
      kind: "json",
      template: "https://api.allorigins.win/get?url=%URL%",
      encode: true,
      note: "Same host, JSON-wrapped. Sometimes gets through when raw does not.",
      enabled: true,
      builtin: true
    },
    {
      id: "codetabs",
      name: "CodeTabs",
      provider: "api.codetabs.com",
      kind: "raw",
      template: "https://api.codetabs.com/v1/proxy/?quest=%URL%",
      encode: true,
      note: "Very slow lately — often over 15 seconds. Kept as a last resort.",
      enabled: true,
      builtin: true
    },

    /* ---------- need an account, so they cannot be defaults ---------- */
    {
      id: "corsproxy-io",
      name: "CorsProxy.io",
      provider: "corsproxy.io",
      kind: "raw",
      template: "https://corsproxy.io/?url=%URL%",
      encode: true,
      note: "Answers 401 without an API key. Free key at corsproxy.io — paste it into the endpoint and turn this on.",
      enabled: false,
      builtin: true
    },
    {
      id: "jina-reader",
      name: "Jina Reader",
      provider: "r.jina.ai",
      kind: "reader",
      template: "https://r.jina.ai/%URL%",
      encode: false,
      note: "Clean article text, but now 401s without a key. Free key at jina.ai, then add it to the endpoint.",
      enabled: false,
      builtin: true
    },

    /* ---------- stopped answering ---------- */
    {
      id: "cors-workers",
      name: "Workers Edge",
      provider: "test.cors.workers.dev",
      kind: "raw",
      template: "https://test.cors.workers.dev/?%URL%",
      encode: false,
      note: "Offline. Left here so you know it was tried, not forgotten.",
      enabled: false,
      builtin: true
    },
    {
      id: "cors-lol",
      name: "cors.lol",
      provider: "api.cors.lol",
      kind: "raw",
      template: "https://api.cors.lol/?url=%URL%",
      encode: true,
      note: "Offline.",
      enabled: false,
      builtin: true
    },
    {
      id: "thingproxy",
      name: "Thingproxy",
      provider: "thingproxy.freeboard.io",
      kind: "raw",
      template: "https://thingproxy.freeboard.io/fetch/%URL%",
      encode: false,
      note: "Offline for years.",
      enabled: false,
      builtin: true
    },

    /* ---------- for a real proxy backend ---------- */
    {
      id: "instance",
      name: "My proxy instance",
      provider: "an Ultraviolet / Wisp server you run",
      kind: "frame",
      template: "https://YOUR-INSTANCE.example/service/%URL%",
      encode: true,
      note: "The only thing that runs sites built entirely in JavaScript — now.gg, cloud gaming, anything with a login. Point this at your own instance and use proxy-instance mode.",
      enabled: false,
      builtin: true
    },
    {
      id: "direct",
      name: "No relay",
      provider: "your own connection",
      kind: "direct",
      template: "%URL%",
      encode: false,
      note: "Straight request from your browser. Only works on sites that already allow cross-origin reads.",
      enabled: false,
      builtin: true
    }
  ];

  FP.defaultRelays = function () {
    return FP.BUILTIN_RELAYS.map(function (r) { return Object.assign({}, r); });
  };

  FP.KIND_LABELS = {
    raw: "raw bytes",
    json: "json wrapped",
    reader: "text only",
    frame: "proxy instance",
    direct: "no relay"
  };
})(window.FP = window.FP || {});
