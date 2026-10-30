# Relay

A web proxy that runs entirely in the browser and only ever talks to **free, public, no-account relays**.
No login, no key, no backend of its own. Every relay in the list is editable in Settings.

## Run it

Three ways, all of them supported:

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
build.js          inlines everything -> dist/relay.html
css/core.css      tokens and shared components
css/skins.css     the skins + their backdrops  <- add yours here
css/home.css      launcher layout
css/views.css     viewport / settings / about layouts
js/relays.js      the relay list, with what works and what doesn't
worker/relay-worker.js   your own relay, for Cloudflare's free plan
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

### Sites that can never work this way

now.gg, GeForce Now, Discord, Roblox, Netflix — anything that is a JavaScript app rather than a
document. The relay fetches HTML; these ship an empty shell and build themselves at runtime, behind a
login. There is no page to hand back. Relay says so up front now instead of grinding through six
relays first.

Those need a real proxy backend — Ultraviolet, Wisp, a Rammerhead instance, something that rewrites
traffic server-side. Add it as a relay of type **proxy instance** and switch the mode to match.

### Opening from `file://`

A page opened straight off disk sends `Origin: null`, and several relays reject it outright — that's
the "Failed to fetch" you'll see. Serve the folder, host it, or run it through your launcher, and they
come back. Relay warns about this on startup when it detects `file://`.

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
