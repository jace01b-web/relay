/* ===========================================================
   Relay — the proxy engine
   -----------------------------------------------------------
   Asks a free relay for a page, then rewrites that page so every
   link, image and stylesheet inside it also travels through the
   relay. The result is rendered in a sandboxed frame, which keeps
   the fetched page away from your settings and history.
   =========================================================== */

(function (FP) {
  "use strict";

  var SAFE_SCHEMES = /^(https?:)$/i;

  var engine = {

    /* ---------- addresses ---------- */

    normalize: function (input) {
      var q = String(input || "").trim();
      if (!q) return "";
      if (/^(javascript|data|file|blob|chrome|about):/i.test(q)) return "";
      if (/^https?:\/\//i.test(q)) return q;

      var looksLikeHost = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/|$|\?|#)/i.test(q) ||
                          /^localhost(:\d+)?(\/|$)/i.test(q);
      if (looksLikeHost && !/\s/.test(q)) return "https://" + q;

      var tpl = FP.store.get("searchEngine") || "https://duckduckgo.com/?q=%s";
      return tpl.replace("%s", encodeURIComponent(q));
    },

    host: function (url) {
      try { return new URL(url).host; } catch (e) { return url; }
    },

    resolve: function (href, base) {
      try {
        var u = new URL(href, base);
        return SAFE_SCHEMES.test(u.protocol) ? u.href : "";
      } catch (e) { return ""; }
    },

    /* ---------- relays ---------- */

    supports: function (relay, mode) {
      if (mode === "proxy") return false;   /* proxy mode does not use relays at all */
      if (!relay) return false;
      if (mode === "frame") return relay.kind === "frame" || relay.kind === "direct";
      if (mode === "reader") return relay.kind !== "frame";
      return relay.kind === "raw" || relay.kind === "json" || relay.kind === "direct";
    },

    build: function (relay, url) {
      if (!relay) return url;
      var target = relay.encode ? encodeURIComponent(url) : url;
      return relay.template.indexOf("%URL%") >= 0
        ? relay.template.replace("%URL%", target)
        : relay.template + target;
    },

    /* One attempt through one relay. Resolves {body, ms, kind}. */
    request: function (relay, url, timeout) {
      var started = Date.now();
      var endpoint = engine.build(relay, url);
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); },
        timeout || FP.store.get("timeout") || 12000);

      return fetch(endpoint, {
        method: "GET",
        credentials: "omit",
        redirect: "follow",
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) {
          var why = engine.explain(res.status);
          throw new Error("relay answered " + res.status + (why ? " — " + why : ""));
        }
        return res.text();
      }).then(function (text) {
        clearTimeout(timer);
        var body = text;
        if (relay.kind === "json") {
          try {
            var parsed = JSON.parse(text);
            body = parsed.contents != null ? parsed.contents
                 : parsed.body != null ? parsed.body
                 : parsed.data != null ? parsed.data : text;
          } catch (e) { /* not JSON after all; use as-is */ }
        }
        if (!body || !String(body).trim()) throw new Error("relay returned an empty page");
        return { body: String(body), ms: Date.now() - started, kind: relay.kind, relay: relay };
      }).catch(function (err) {
        clearTimeout(timer);
        var why;
        if (err && err.name === "AbortError") {
          why = "timed out — the page is probably too big for a free relay";
        } else if (err && /failed to fetch|networkerror|load failed/i.test(err.message || "")) {
          why = engine.fromFile()
            ? "refused this page's origin (opened from a file)"
            : "no answer — the relay is down or blocked here";
        } else {
          why = (err && err.message) || "failed";
        }
        throw new Error(why);
      });
    },

    /* what a relay's status code means in practice */
    explain: function (status) {
      if (status === 401 || status === 403) return "needs an API key";
      if (status === 408 || status === 504) return "gave up on the page, too heavy";
      if (status === 429) return "rate limit, wait a moment";
      if (status === 404) return "endpoint is wrong or gone";
      if (status >= 500) return "relay is having trouble";
      return "";
    },

    /* file:// pages send Origin: null, which several relays reject */
    fromFile: function () {
      return location.protocol === "file:";
    },

    /* one sentence naming the most likely cause of a total failure */
    advise: function (attempts, url) {
      var all = attempts.map(function (a) { return a.why; }).join(" ");

      if (engine.fromFile() && /origin|no answer/.test(all)) {
        return "This page is open from a file, so relays see it as coming from nowhere and several refuse it. " +
               "Serve the folder, or run it through your launcher, and most of these come back.";
      }
      if (engine.isAppSite(url)) {
        return "Sites like this one are built entirely in JavaScript, so the relay gets an empty shell. " +
               "The storefront may render, but nothing will launch. Only a real proxy instance can run it.";
      }
      if (/too heavy|too big|rate limit/.test(all)) {
        return "The free relays time out on pages this size. Reader mode is lighter, and your own relay " +
               "(Settings → Relays → My Worker) has no such limit.";
      }
      if (/needs an API key/.test(all) && attempts.length <= 2) {
        return "The relays that answered want an API key. Set up your own relay instead — it takes two minutes " +
               "and the steps are in worker/relay-worker.js.";
      }
      return "The site may block proxies, or the relays are rate-limited. Try reader mode, or set up your own " +
             "relay in Settings for something that does not fall over.";
    },

    /* sites that are an app, not a document: a text relay can never serve these */
    isAppSite: function (url) {
      return /(^|\.)(now\.gg|nowgg|geforcenow|play\.geforcenow\.com|xbox\.com|boosteroid|netflix|spotify|discord\.com|roblox\.com|figma\.com|meet\.google)/i
        .test(engine.host(url || ""));
    },

    /* Walks the relay chain until one works. */
    load: function (url, mode) {
      var chain = FP.store.chain(mode);
      var attempts = [];
      if (!chain.length) {
        return Promise.reject({
          message: "No relay can serve this mode.",
          attempts: [],
          hint: "Turn on at least one relay in Settings."
        });
      }

      var i = 0;
      function next() {
        var relay = chain[i++];
        if (!relay) {
          return Promise.reject({
            message: "Every relay refused this page.",
            attempts: attempts,
            hint: engine.advise(attempts, url)
          });
        }
        if (FP.onAttempt) FP.onAttempt(relay, i, chain.length);
        return engine.request(relay, url).then(function (out) {
          FP.store.setPing(relay.id, out.ms);
          out.attempts = attempts;
          return out;
        }).catch(function (err) {
          attempts.push({ relay: relay.name, why: err.message });
          FP.store.setPing(relay.id, -1);
          return next();
        });
      }
      return next();
    },

    /* Latency probe: fetch a tiny page through the relay. */
    ping: function (relay) {
      if (relay.kind === "frame") return Promise.resolve(-1);
      var target = "https://example.com/";
      var started = Date.now();
      return engine.request(relay, target, 9000).then(function () {
        var ms = Date.now() - started;
        FP.store.setPing(relay.id, ms);
        return ms;
      }).catch(function () {
        FP.store.setPing(relay.id, -1);
        return -1;
      });
    },

    /* ---------- rewriting ---------- */


    /* Runs first inside the frame, before any of the page's own code.
       With <base> pointing at the real site, the browser already loads
       images, CSS, fonts and scripts straight from there. What it
       cannot do is the page's own fetch/XHR — those are cross-origin
       and would be refused — so those get routed through the relay.
       This is what lets a page keep working instead of being a
       flattened snapshot. */
    prelude: function (pageUrl, relay) {
      return [
        "(function(){",
        "  var BASE = " + JSON.stringify(pageUrl) + ";",
        "  var TPL  = " + JSON.stringify(relay.template) + ";",
        "  var ENC  = " + (relay.encode ? "true" : "false") + ";",
        "  function abs(u){ try { return new URL(u, BASE).href; } catch(e){ return null; } }",
        "  function via(u){",
        "    var a = abs(u); if(!a) return u;",
        "    if(/^(data|blob):/i.test(a)) return a;",
        "    var t = ENC ? encodeURIComponent(a) : a;",
        "    return TPL.indexOf('%URL%') >= 0 ? TPL.replace('%URL%', t) : TPL + t;",
        "  }",
        "  window.__relay = { base: BASE, via: via, abs: abs };",
        "",
        "  /* storage in a sandboxed frame throws; a page that touches it",
        "     should not die on the spot */",
        "  function memStore(){",
        "    var m = {};",
        "    return { getItem:function(k){ return k in m ? m[k] : null; },",
        "             setItem:function(k,v){ m[k]=String(v); },",
        "             removeItem:function(k){ delete m[k]; },",
        "             clear:function(){ m={}; },",
        "             key:function(i){ return Object.keys(m)[i] || null; },",
        "             get length(){ return Object.keys(m).length; } };",
        "  }",
        "  ['localStorage','sessionStorage'].forEach(function(name){",
        "    var ok = false;",
        "    try { var s = window[name]; s.setItem('__r','1'); s.removeItem('__r'); ok = true; } catch(e){}",
        "    if(!ok){ try { Object.defineProperty(window, name, { value: memStore(), configurable: true }); } catch(e){} }",
        "  });",
        "  try { document.cookie; } catch(e){",
        "    var jar = '';",
        "    try { Object.defineProperty(document, 'cookie', {",
        "      get:function(){ return jar; },",
        "      set:function(v){ jar = jar ? jar + '; ' + v : v; }, configurable: true }); } catch(e2){}",
        "  }",
        "",
        "  /* the page's own calls, routed through the relay */",
        "  var realFetch = window.fetch && window.fetch.bind(window);",
        "  if(realFetch){",
        "    window.fetch = function(input, init){",
        "      try {",
        "        var url = typeof input === 'string' ? input : (input && input.url);",
        "        if(url && !/^(data|blob):/i.test(url)) {",
        "          var proxied = via(url);",
        "          if(typeof input === 'string') input = proxied;",
        "          else input = new Request(proxied, input);",
        "          init = Object.assign({}, init, { credentials: 'omit' });",
        "        }",
        "      } catch(e){}",
        "      return realFetch(input, init);",
        "    };",
        "  }",
        "  var open = XMLHttpRequest.prototype.open;",
        "  XMLHttpRequest.prototype.open = function(method, url){",
        "    try { if(url && !/^(data|blob):/i.test(url)) url = via(url); } catch(e){}",
        "    return open.apply(this, [method, url].concat([].slice.call(arguments, 2)));",
        "  };",
        "",
        "  /* sockets cannot be relayed; say so instead of hanging */",
        "  try {",
        "    var RealWS = window.WebSocket;",
        "    window.WebSocket = function(){",
        "      parent.postMessage({ rl:'notice', text:'This site wants a live connection (WebSocket), which a relay cannot carry.' }, '*');",
        "      throw new Error('WebSocket is not available through a relay');",
        "    };",
        "    window.WebSocket.prototype = RealWS.prototype;",
        "  } catch(e){}",
        "",
        "  /* keep the shell's address bar honest without letting the",
        "     page navigate the frame out from under us */",
        "  try {",
        "    var ps = history.pushState, rs = history.replaceState;",
        "    history.pushState = function(a,b,u){ if(u) parent.postMessage({rl:'url', url: abs(u)}, '*'); return ps.apply(history, arguments); };",
        "    history.replaceState = function(a,b,u){ if(u) parent.postMessage({rl:'url', url: abs(u)}, '*'); return rs.apply(history, arguments); };",
        "  } catch(e){}",
        "})();"
      ].join("\n");
    },

    /* Build a document the page can keep running inside. */
    rewrite: function (html, pageUrl, relay, opts) {
      opts = opts || {};
      var doc;
      try { doc = new DOMParser().parseFromString(html, "text/html"); }
      catch (e) { return engine.textDocument(html, pageUrl); }
      if (!doc || !doc.documentElement) return engine.textDocument(html, pageUrl);

      /* The page's own <base>, if it has one, decides what its relative
         URLs mean. Ours then points at the real site, so the browser
         fetches images, CSS, fonts and scripts straight from there —
         no relay in the middle, and nothing to rewrite. */
      var base = pageUrl;
      var baseEl = doc.querySelector("base[href]");
      if (baseEl) {
        base = engine.resolve(baseEl.getAttribute("href"), pageUrl) || pageUrl;
        baseEl.parentNode.removeChild(baseEl);
      }

      /* things that would break the frame or escape it */
      Array.prototype.forEach.call(doc.querySelectorAll("meta[http-equiv]"), function (el) {
        var what = (el.getAttribute("http-equiv") || "").toLowerCase();
        if (what === "content-security-policy" || what === "refresh") el.parentNode.removeChild(el);
      });
      Array.prototype.forEach.call(doc.querySelectorAll("iframe, frame"), function (el) {
        el.parentNode.removeChild(el);
      });

      if (opts.stripScripts) {
        Array.prototype.forEach.call(doc.querySelectorAll("script"), function (el) {
          el.parentNode.removeChild(el);
        });
        Array.prototype.forEach.call(doc.querySelectorAll("*"), function (el) {
          Array.prototype.slice.call(el.attributes || []).forEach(function (a) {
            if (/^on/i.test(a.name)) el.removeAttribute(a.name);
          });
        });
      }

      if (opts.blockImages) {
        Array.prototype.forEach.call(doc.querySelectorAll("img, picture source"), function (el) {
          el.removeAttribute("src"); el.removeAttribute("srcset");
          el.setAttribute("data-blocked", "1");
        });
      }

      /* links stay readable but go through the shell */
      Array.prototype.forEach.call(doc.querySelectorAll("a[href]"), function (el) {
        var abs = engine.resolve(el.getAttribute("href"), base);
        el.removeAttribute("target");
        if (abs) { el.setAttribute("data-rl", abs); el.setAttribute("href", abs); }
      });

      Array.prototype.forEach.call(doc.querySelectorAll("form"), function (el) {
        var abs = engine.resolve(el.getAttribute("action") || base, base);
        el.setAttribute("data-rl-action", abs || base);
        el.setAttribute("data-rl-method", (el.getAttribute("method") || "get").toLowerCase());
        el.removeAttribute("action");
      });

      var head = doc.head || doc.documentElement;

      var charset = doc.createElement("meta");
      charset.setAttribute("charset", "utf-8");
      head.insertBefore(charset, head.firstChild);

      var baseTag = doc.createElement("base");
      baseTag.setAttribute("href", base);
      head.insertBefore(baseTag, charset.nextSibling);

      /* the prelude has to run before any of the page's own scripts */
      var boot = doc.createElement("script");
      boot.textContent = engine.prelude(base, relay);
      head.insertBefore(boot, baseTag.nextSibling);

      var patch = doc.createElement("style");
      patch.textContent = "[data-blocked]{outline:1px dashed #9993;min-height:12px}a[data-rl]{cursor:pointer}";
      head.appendChild(patch);

      var shell = doc.createElement("script");
      shell.textContent = engine.BOOTSTRAP;
      (doc.body || head).appendChild(shell);

      return "<!doctype html>" + doc.documentElement.outerHTML;
    },

    /* Plain text (or markdown-ish) relays land here. */
    textDocument: function (text, pageUrl) {
      var esc = engine.escape(text);
      /* light markdown so Jina output reads properly */
      esc = esc
        .replace(/^###\s?(.+)$/gm, "<h3>$1</h3>")
        .replace(/^##\s?(.+)$/gm, "<h2>$1</h2>")
        .replace(/^#\s?(.+)$/gm, "<h1>$1</h1>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a data-rl="$2" href="$2">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");

      return engine.frameDocument(
        '<article class="plain">' + esc + "</article>",
        engine.READER_CSS + ".plain{white-space:pre-wrap}"
      );
    },

    /* Reader view: pull the main text out of a full page. */
    reader: function (html, pageUrl, relay) {
      var doc;
      try { doc = new DOMParser().parseFromString(html, "text/html"); } catch (e) { doc = null; }
      if (!doc || !doc.body) return engine.textDocument(html, pageUrl);

      ["script", "style", "noscript", "nav", "aside", "footer", "header", "form",
       "iframe", "svg", "button", "[aria-hidden='true']", "[role='navigation']"]
        .forEach(function (sel) {
          Array.prototype.forEach.call(doc.querySelectorAll(sel), function (el) {
            el.parentNode && el.parentNode.removeChild(el);
          });
        });

      var best = null, bestScore = 0;
      var candidates = doc.querySelectorAll("article, main, [role='main'], .post, .article, .content, #content, div, section");
      Array.prototype.forEach.call(candidates, function (el) {
        var ps = el.querySelectorAll("p");
        var len = 0;
        Array.prototype.forEach.call(ps, function (p) { len += (p.textContent || "").trim().length; });
        var score = len + ps.length * 25;
        if (el.tagName === "ARTICLE" || el.tagName === "MAIN") score *= 1.4;
        if (score > bestScore) { bestScore = score; best = el; }
      });
      if (!best || bestScore < 260) best = doc.body;

      var via = function (href) {
        /* pictures come straight from the site, same as above */
        return engine.resolve(href, pageUrl);
      };

      Array.prototype.forEach.call(best.querySelectorAll("img"), function (el) {
        var u = via(el.getAttribute("src") || el.getAttribute("data-src"));
        if (u) { el.setAttribute("src", u); el.removeAttribute("srcset"); }
        else el.parentNode.removeChild(el);
      });
      Array.prototype.forEach.call(best.querySelectorAll("a[href]"), function (el) {
        var abs = engine.resolve(el.getAttribute("href"), pageUrl);
        if (abs) { el.setAttribute("data-rl", abs); el.setAttribute("href", abs); }
        else el.removeAttribute("href");
        el.removeAttribute("target");
      });
      Array.prototype.forEach.call(best.querySelectorAll("*"), function (el) {
        Array.prototype.slice.call(el.attributes || []).forEach(function (a) {
          if (/^on/i.test(a.name) || a.name === "class" || a.name === "id" || a.name === "style") {
            el.removeAttribute(a.name);
          }
        });
      });

      var title = (doc.querySelector("title") || {}).textContent || engine.host(pageUrl);
      var body = '<h1>' + engine.escape(title.trim()) + "</h1>" +
        '<p class="src">' + engine.escape(engine.host(pageUrl)) + " · reader view</p>" +
        '<article>' + best.innerHTML + "</article>";

      return engine.frameDocument(body, engine.READER_CSS);
    },

    frameDocument: function (bodyHtml, css) {
      return "<!doctype html><html><head><meta charset='utf-8'>" +
        "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
        "<style>" + css + "</style></head><body>" + bodyHtml +
        "<script>" + engine.BOOTSTRAP + "<\/script></body></html>";
    },

    escape: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },

    title: function (html) {
      var m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html || "");
      if (!m) return "";
      var t = m[1].replace(/\s+/g, " ").trim();
      var d = document.createElement("textarea");
      d.innerHTML = t;
      return d.value;
    },

    READER_CSS:
      ":root{color-scheme:dark}" +
      "body{margin:0;padding:46px 22px 90px;background:#11182b;color:#e8ebf7;" +
      "font:17px/1.72 'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif}" +
      "body>*,article{max-width:72ch;margin-inline:auto}" +
      "h1{font-size:1.75rem;line-height:1.2;margin:0 0 6px}" +
      "h2{font-size:1.2rem;margin:1.8em 0 .4em}h3{font-size:1.05rem;margin:1.5em 0 .3em}" +
      ".src{font:12px/1.5 'IBM Plex Mono',monospace;color:#8e97c4;margin:0 0 30px}" +
      "p,li{font-size:1.02rem}img{max-width:100%;height:auto;border-radius:8px;margin:14px 0}" +
      "a{color:#f7a93b}pre,code{font-family:'IBM Plex Mono',monospace;font-size:.88em}" +
      "pre{overflow-x:auto;background:#0d1324;padding:12px;border-radius:8px}" +
      "blockquote{border-left:2px solid #30396b;margin:1em 0;padding-left:16px;color:#b9c0e0}" +
      "table{max-width:100%;overflow-x:auto;display:block;border-collapse:collapse}" +
      "td,th{border:1px solid #30396b;padding:6px 10px}",

    /* Runs inside the sandboxed frame. It cannot reach this site's
       storage; it only talks back through postMessage. */
    BOOTSTRAP: [
      "(function(){",
      "  function send(msg){ try{ parent.postMessage(msg,'*'); }catch(e){} }",
      "  document.addEventListener('click', function(e){",
      "    var a = e.target && e.target.closest ? e.target.closest('a') : null;",
      "    if(!a) return;",
      "    var to = a.getAttribute('data-rl') || a.getAttribute('href');",
      "    if(!to || to.charAt(0)==='#') return;",
      "    e.preventDefault();",
      "    send({ rl:'navigate', url:to, newTab: e.metaKey||e.ctrlKey||e.button===1 });",
      "  }, true);",
      "  document.addEventListener('submit', function(e){",
      "    var f = e.target; if(!f || f.tagName!=='FORM') return;",
      "    e.preventDefault();",
      "    var action = f.getAttribute('data-rl-action') || '';",
      "    var method = (f.getAttribute('data-rl-method')||'get');",
      "    if(method !== 'get'){ send({ rl:'notice', text:'This form needs POST, which free relays cannot forward.' }); return; }",
      "    var pairs = [];",
      "    Array.prototype.forEach.call(f.elements||[], function(el){",
      "      if(!el.name || el.disabled) return;",
      "      if((el.type==='checkbox'||el.type==='radio') && !el.checked) return;",
      "      if(el.type==='file'||el.type==='submit'||el.type==='button') return;",
      "      pairs.push(encodeURIComponent(el.name)+'='+encodeURIComponent(el.value==null?'':el.value));",
      "    });",
      "    var url = action.split('#')[0];",
      "    url += (url.indexOf('?')>=0 ? '&' : '?') + pairs.join('&');",
      "    send({ rl:'navigate', url:url });",
      "  }, true);",
      "  window.addEventListener('keydown', function(e){ send({ rl:'key', key:e.key }); });",
      "  send({ rl:'ready', title: document.title||'' });",
      "})();"
    ].join("\n")
  };

  FP.engine = engine;
})(window.FP = window.FP || {});
