# Relay

A web proxy with two halves:

- **Proxy mode** — a real proxy. A service worker sits between the site and the network, so the site
  *runs*: its scripts execute, its fetch and XHR calls are proxied, images and fonts come through,
  links work, logins hold. Needs a backend, which is one file pasted into a free Cloudflare Worker.
- **Relay modes** — no server at all. Fetch a page through a free public CORS relay and rewrite it.
  Good for reading; it can't run an app. This is what the whole thing used to be.

No account, no key, nothing to log into. Everything is editable in Settings.

## Setting it up

**Nothing to set up.** Upload the folder; `loader.html` launches it.

- `dist/relay.html` — the whole app as one file, every stylesheet and script inlined. This is what
  gets written into the blank window. Rebuild it with `node build.js` after changing the source.
- `loader.html` — host this on your own site. It pulls `dist/relay.html` off a CDN and writes it into
  `about:blank`. No GitHub API, no token, no rate limit — jsDelivr first, then Fastly, Statically,
  githack and raw.githubusercontent as fallbacks, in that order, first one that answers wins.

Change the four lines at the top of `loader.html` (`USER`, `REPO`, `BRANCH`, `FILE`) if you move the
repo. `TAB_TITLE` and `TAB_ICON` there set what the launched tab calls itself.

```bash
node build.js        # only when you change the source: rebuilds dist/relay.html
```

### Live page — the default, and how it proxies without a backend

The page comes through a relay, then every address inside it is rewritten to go the same way, and a
prelude is injected ahead of the site's own code to catch whatever the HTML didn't.

| What | How |
|---|---|
| images, `srcset`, video posters, audio, `<track>`, embeds | rewritten to relay URLs when the page is parsed |
| stylesheets | fetched through the relay and inlined, with their `url()` and `@import` rewritten too — a `<link>` sent through a relay would resolve its own urls against the relay and come back broken |
| the site's scripts | kept, and loaded through the relay |
| its `fetch()`, `XMLHttpRequest`, `sendBeacon` | patched to go through the relay |
| anything added later | a MutationObserver rewrites new nodes and changed `src`/`srcset`/`poster` |
| `new Image()`, `new Audio(url)` | the property setters *and* the constructors are wrapped — a constructor argument never reaches the setter |
| `localStorage`, cookies | shimmed in memory, since a sandboxed frame has none |
| links, GET forms, `pushState` | handed back to the shell |

**Measured, not assumed.** The test serves the site on a second port the browser is *forbidden* to
contact, so anything that renders can only have come through the relay:

```
<img src>  <img srcset>  stylesheet  css background  <audio>  <video poster>
new Image()  new Audio()        all through the relay
direct hits to the blocked domain: 0
```

The default for images and styles is **straight from the site**: it is much faster and uses one relay
request per page instead of dozens. Switch to Settings → Browsing → *Images and styles* → **through
the relay** when assets are blocked on your network. Those assets may not load when the page itself
uses direct loading and the site is blocked.

**One relay does all of it**, so a busy page can mean dozens of requests to the same free service, and
AllOrigins will rate-limit. If you use this regularly, put up your own relay: `worker/relay-worker.js`
pasted into a free Cloudflare Worker (clicks, no commands), then Settings → Relays → **My Worker** →
Edit, paste the address, turn it on, drag it to the top. 100,000 requests a day and no limit worth
worrying about.

### What live page cannot do

- **WebSockets.** A relay can't carry one. Sites that stream — now.gg, cloud gaming, live chat — won't
  run. The page says so instead of hanging.
- **Logins.** No cookies travel with the request, so anything behind a sign-in stays signed out.
- **The heaviest single-page apps.** Code that reads `location.href` expecting the real address, or
  that needs its own origin, will misbehave.

Those need a service worker, and **a service worker cannot be registered from an `about:blank`
document** — that's a browser rule, not something code can get around. Which is what proxy mode is:

### Proxy mode (optional, needs the hosted site)

If you ever open Relay at its real address instead of in a blank window, switch the mode to **proxy**
and it becomes a true proxy — Ultraviolet rewriting everything through a service worker, with links,
logins and sockets. It needs a backend, which is one file pasted into a free Cloudflare Worker
(`worker/bare-worker.js`; the four steps show on screen when it isn't set up yet). Verified end to end
from a plain static host: scripts, fetch, XHR, images, CSS and link navigation all working.

Note that proxy mode wants the site at a **domain root** — the service worker's scope is the site's
folder, so on `you.github.io/relay/` a proxied link to `/login` escapes it.

## Relay modes (no server)

Three ways to run the static half:

**1. Straight off the disk** — open `index.html`. A few relays refuse requests from `file://` pages, so
serving it is steadier:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

**2. Hosted** — drop the folder on GitHub Pages, Netlify, or any static host. Nothing to build.

**3. Through a loader, into about:blank** — the one your launcher uses:

```bash
node build.js        # -> dist/relay.html, everything inlined, one file
```

Commit `dist/relay.html`, then have the loader fetch it and write it into the blank window:

```js
var win = window.open("about:blank", "_blank");          // open inside the click
var html = await (await fetch(RAW_URL, {cache:"no-store"})).text();
win.document.open(); win.document.write(html); win.document.close();
```

Fetch from a raw URL, not the github.com page —
`raw.githubusercontent.com/<you>/<repo>/main/dist/relay.html`, or jsDelivr
(`cdn.jsdelivr.net/gh/<you>/<repo>@main/dist/relay.html`) for CDN caching. Pin a tag instead of `main`
and a half-finished push can never reach anyone mid-load. Open the window inside the click handler,
before the fetch resolves — a window opened after an `await` is what pop-up blockers stop.

### Why it survives about:blank

A written-in document has no URL, no file paths and no page loads, so the app is built for that:

- **One document, four views.** Home, viewport, settings and how-it-works are sections that swap in
  place. Nothing ever calls `location.href`, and nothing reads `?url=`.
- **No file references.** The single-file build inlines every stylesheet and script; the favicon is a
  data URI. The only outside request is the Google Fonts stylesheet, and it degrades to system fonts.
- **Storage that cannot throw.** A blank window opened from your page inherits its origin, so
  localStorage works normally. Where it doesn't — a sandboxed frame, a blank window opened from
  another blank window — it falls back to the opener's storage, then to memory. The app runs either
  way; settings just don't outlive the window, and the settings view says so.
- **New windows get a copy, not a link.** "Open in a new tab" and "blank window" write the whole
  document into the new window and tell it which page to open, because there is no address to point at.
- **Relays are reached with `fetch`.** From an opaque origin the request carries `Origin: null`, which
  every relay in the default list accepts (they all answer `Access-Control-Allow-Origin: *`).

Edit the multi-file source, re-run `node build.js`, push both. The two stay in sync because the build
is just the same files inlined.

## Files

```
index.html        the whole app: all four views in one document
sw.js             the service worker (site root, so its scope is the whole site)
uv/               Ultraviolet: the rewriter
baremux/ epoxy/ baremod/   browser-side transports
server/           Wisp + Bare endpoints, and deploy configs
build.js          inlines everything -> dist/relay.html
css/core.css      tokens and shared components
css/skins.css     the skins + their backdrops  <- add yours here
css/home.css      launcher layout
css/views.css     viewport / settings / about layouts
js/relays.js      the relay list, with what works and what doesn't
worker/bare-worker.js    the proxy backend — paste into a Cloudflare Worker
worker/run-local.mjs     runs that same file on your machine
worker/relay-worker.js   a simple relay for the relay modes, also a Worker
js/shortcuts.js   the default tiles
js/store.js       settings, tiles + history in localStorage
js/engine.js      fetch, failover, HTML/CSS rewriting, reader extraction
js/router.js      view switching
js/shell.js       skin, tab appearance, escape key, new windows
js/home.js        launcher view
js/browse.js      viewport view
js/settings.js    settings view
js/boot.js        start-up
```

## Skins

Three ship with it, switchable in Settings → Look:

- **Opium** — purple night sky, drifting stars, cream-to-orange italic wordmark, lit town on the
  horizon. Through October it adds the Halloween set: webs, bats, a dangling spider, pumpkins, a moon
  and the odd shooting star. *Backdrop* in settings switches that between seasonal, always on, and off.
- **Strawberri** — black cherry base, heavy pink wordmark, two lime glow blobs; one of them leans
  toward your pointer.
- **Console** — the original dark blue instrument panel.

The wordmark text, the tagline and the tiles are all yours to change in Settings. A skin is one block of
CSS variables in `css/skins.css` — copy one, rename the `data-theme`, and add it to `THEMES` in
`js/settings.js`.

## Modes

| Mode | What it does | Use when |
|---|---|---|
| **Proxy** | A service worker proxies everything the site does. The site really runs. | Default. Anything interactive |
| Full page | Fetches the page and rewrites every link, image and stylesheet to travel through the relay too. Scripts are stripped by default. | Normal browsing |
| Reader | Pulls out the main text and pictures only. | Articles, slow relays, sites that fight back |
| Proxy instance | Loads a full web-proxy server (one you add yourself) directly in a frame. | You run your own proxy, or have an instance address |

## Adding a relay

Settings → Relays → Add a relay. `%URL%` marks where the target address goes.

- `https://service.example/fetch?url=%URL%` → type **raw bytes**, percent-encoding **on**
- `https://service.example/%URL%` → percent-encoding **off**
- returns JSON with the page in `contents` → type **json wrapped**
- returns plain text → type **text only**
- a full proxy server → type **proxy instance**, then use proxy-instance mode

Hit **Test** on any row to measure it. With the relay set to *fastest available*, the quickest one
answers first and the others stand in if it fails.

## Relays: read this before you file a bug

Tested from a real browser on 30 Oct 2026, against a normal web page:

| Relay | Result |
|---|---|
| **AllOrigins** | works — the last free one still answering. Rate-limits under bursts, returns 408 on heavy pages |
| **AllOrigins (wrapped)** | works, same host, different failure moods |
| CodeTabs | over 15 seconds or times out |
| CorsProxy.io | 401 — needs an API key now |
| Jina Reader | 401 — needs an API key now |
| cors.lol, test.cors.workers.dev, thingproxy, cors.eu.org | offline |
| whateverorigin.org | answers 200 and returns **its own homepage** for every request — worse than being down |

So: one and a half working public relays, both on the same host. The dead and key-gated ones ship
switched off with the reason written on them, rather than quietly failing six relays deep.

### Put up your own relay (2 minutes, free)

`worker/relay-worker.js` is a complete Cloudflare Worker. Paste it into a new Worker, deploy, and add
the address as a relay — the file has the click-by-click steps at the top. The free plan allows 100,000
requests a day. Yours has no rate limit worth worrying about, no internal timeout, and it strips the
`content-security-policy` and `x-frame-options` headers that stop fetched pages from rendering in a
frame, which the public relays don't do. Pages look noticeably better through it.

### One relay request per page, not sixty

Only the HTML document goes through a relay by default. Images, stylesheets, fonts and media load
straight from the site, because a browser fetches those cross-origin without asking CORS. Routing
them through the relay as well — which is what the first version did — turned one page into sixty relay
requests, which rate-limited the relay instantly and left every picture broken and every stylesheet
unapplied.

Measured on a 20-image test page: **22 relay requests before, 1 after.**

Settings → Browsing → *Images and styles* switches it back to **through the relay**, for when the
pictures themselves are blocked on your network. Expect it to be slow and to break on free relays.

### Sites the relay modes can never serve

now.gg, GeForce Now, Discord, Roblox, Netflix — anything that is a JavaScript app rather than a
document. A relay fetches HTML; these ship an empty shell and build themselves at runtime. There is
nothing to hand back, and Relay says so up front instead of grinding through six relays first.

**Use proxy mode for those.** That is exactly what it is for.

### Opening from `file://`

A page opened straight off disk sends `Origin: null`, and several relays reject it outright — that's
the "Failed to fetch" you'll see. Serve the folder, host it, or run it through your launcher, and they
come back. Relay warns about this on startup when it detects `file://`.

## The Relay server

Proxy mode can use the server in `server/`, which provides two transports:

- **`/wisp/`** — a raw TCP tunnel. Epoxy in the browser carries HTTP and TLS over it; this transport
  supports WebSockets for live sites.
- **`/bare/`** — the server makes HTTP requests and returns the responses. It is steadier for ordinary
  page loads but does not support WebSockets.

Both transports ship together. Choose between them in Settings → Connection → Transport. The server
can also serve the Relay site, so one deployment can host both.

### Run the server locally

```bash
cd server
npm install
npm start           # http://localhost:8080
```

Open the local address, select **proxy** mode, and leave the Wisp and Bare fields blank to use the host
that served the page. To test against a site on the same machine, start the server with
`ALLOW_PRIVATE=1`. Private and loopback targets are blocked by default to prevent a public deployment
from reaching the host's network; use this setting only for local testing, never on a public host.

### Deploy the server

For Render, push the repository to GitHub, create a **Blueprint** from it, and deploy the existing
`render.yaml`. The free instances sleep after roughly 15 minutes idle and can take about 30 seconds to
wake. Koyeb, Railway, and Fly can build from the `Dockerfile` at the repository root.

For another Node host, use Node 18 or newer, run `cd server && npm install` and `node server.js`, and
set `PORT` if required by the host. The server also supports `DNS_SERVERS`, a comma-separated list of
resolvers such as `1.1.1.1,8.8.8.8`, for hosts with unreliable DNS.

If Relay is hosted elsewhere, set Settings → Connection → **Wisp server** to
`wss://<your-app>.onrender.com/wisp/`, or **Bare server** to
`https://<your-app>.onrender.com/bare/`. Proxy mode works best when Relay is served from a domain
root: a proxied absolute path such as `/login` can escape the service worker's scope on
`you.github.io/relay/`.

### A word on running a server

Anyone who can reach a proxy server can browse through it, and its host sees that traffic as coming
from its account. Keep the URL private and do not run it where the traffic could cause a problem.

## What this is not

**Not a VPN.** It moves one page request through a public relay; it doesn't encrypt your traffic or hide
your address from your network. Whoever runs a relay can see every page you ask for and everything in it.

Don't sign in to anything through it, don't send anything private, and treat the pages that come back as
untrusted — which is why they render in a sandboxed frame with scripts stripped, kept away from your
settings and history.

Logins and POST forms won't work. Sites built entirely in JavaScript won't render in full-page mode;
those need a real proxy instance.

## Storage

Settings, relays, measured latency and the recent list live in this browser's localStorage and nowhere
else. Export/import carries them to another browser as a JSON file. *Reset everything* clears the lot.
