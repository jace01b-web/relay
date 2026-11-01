# The Relay server

Proxy mode needs a server. This is it — about 100 lines, two endpoints:

- **`/wisp/`** — a raw TCP tunnel. Epoxy (in your browser) does HTTP and TLS over it.
  This is the one that can carry WebSockets, which live sites need.
- **`/bare/`** — the server does the HTTP itself and hands back the response.
  Steadier on ordinary page loads; no WebSockets.

Both ship together, and you switch between them in Settings → Connection → Transport.
The server also serves the Relay site, so one deploy can be the whole thing.

---

## Run it locally

```bash
cd server
npm install
npm start           # http://localhost:8080
```

Open `http://localhost:8080`, pick **proxy** mode, and go. Leave the Wisp and Bare
fields blank — they default to whatever host served the page.

To test against a site on your own machine, start it with `ALLOW_PRIVATE=1`. Both
transports refuse private and loopback addresses otherwise, and that default is what
stops a public deploy being used to poke around inside the host's network. Don't set it
on a public host.

---

## Put it on a free host

### Render (easiest — `render.yaml` is already here)

1. Push this repo to GitHub.
2. render.com → New → **Blueprint** → pick the repo. It reads `render.yaml`.
3. Deploy. You get `https://<name>.onrender.com`.

Free instances sleep after ~15 minutes idle and take ~30 seconds to wake. First page
load after a nap is slow; after that it's fine.

### Koyeb / Railway / Fly

All take the `Dockerfile` as-is. Build from the repo root, not from `server/`.

### Anywhere else

Node 18+, `cd server && npm install`, `node server.js`. Set `PORT` if the host wants one.

---

## Using it from a site hosted somewhere else

You don't have to serve the site from here. Keep Relay on GitHub Pages and run only
this for the transport:

- Settings → Connection → **Wisp server**: `wss://<your-app>.onrender.com/wisp/`
- or **Bare server**: `https://<your-app>.onrender.com/bare/`

One caveat, and it matters: **proxy mode works best when Relay is served from the root
of a domain.** The service worker's scope is the site's folder, and a proxied page that
links to an absolute path like `/login` has to land back inside that scope. On
`you.github.io/relay/` such a link escapes to `you.github.io/login` and misses the
worker. Serving Relay from this server (or any root domain) avoids that entirely.

---

## Settings

| Variable | Does |
|---|---|
| `PORT` | Port to listen on. Default 8080. |
| `ALLOW_PRIVATE=1` | Allow private/loopback targets. **Local testing only.** |
| `DNS_SERVERS` | Comma-separated resolvers, e.g. `1.1.1.1,8.8.8.8`, if the host's own resolver is unreliable. |

## A word on running this

It's a proxy: whoever can reach it can browse through it, and your host sees that
traffic as coming from your account. Keep the URL to yourself, and don't run it
anywhere that would upset someone if it got busy.
