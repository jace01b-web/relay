/* ===========================================================
   Relay — the transport server
   -----------------------------------------------------------
   This is the only piece that has to run on a host rather than
   on a static site. It does two jobs:

     1. serves the Relay site (the folder above this one)
     2. answers /wisp/ — the WebSocket the proxy talks through

   You can run both here, or keep the site on GitHub Pages and
   run only this for the Wisp endpoint. Either works: point
   Settings -> Connection -> Wisp server at wss://<this host>/wisp/

   Local:
       cd server && npm install && npm start
       -> http://localhost:8080

   Free hosts that work without a card: Render, Koyeb, Fly,
   Railway. render.yaml and the Dockerfile here are ready to go;
   README.md in this folder has the click-by-click.
   =========================================================== */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";

/* Two transports, because they fail in different places:
   - Bare: Node does the HTTP, so keep-alive and redirects behave.
   - Wisp: raw TCP, needed for WebSockets inside proxied sites.
   Relay uses Bare for pages and Wisp when a site opens a socket. */
const bare = createBareServer("/bare/");

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SITE = join(HERE, "..");
const PORT = process.env.PORT || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    if (bare.shouldRoute(req)) { bare.routeRequest(req, res); return; }

    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    let path = decodeURIComponent(url.pathname);

    if (path === "/" || path.endsWith("/")) path += "index.html";

    /* keep requests inside the site folder */
    const file = join(SITE, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(SITE)) {
      res.writeHead(403).end("no");
      return;
    }

    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }

    const body = await readFile(file);
    const headers = {
      "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "content-length": body.length
    };

    /* the service worker has to be allowed to control the whole site */
    if (file.endsWith("sw.js")) headers["service-worker-allowed"] = "/";

    res.writeHead(200, headers).end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" }).end("Server error");
  }
});

/* the proxy's traffic goes through here */
/* the host's own resolver by default; DNS_SERVERS switches to
   explicit ones if the host's resolver is unreliable */
if (process.env.DNS_SERVERS) {
  wisp.options.dns_method = "resolve";
  wisp.options.dns_servers = process.env.DNS_SERVERS.split(",");
} else {
  wisp.options.dns_method = "lookup";
}
/* wisp-js already refuses private, loopback and direct-IP targets
   on its own, which is exactly the protection a public host wants.
   ALLOW_PRIVATE=1 lifts it, and is only for testing against a site
   running on the same machine. */
if (process.env.ALLOW_PRIVATE === "1") {
  wisp.options.allow_private_ips = true;
  wisp.options.allow_loopback_ips = true;
}

server.on("upgrade", (req, socket, head) => {
  if ((req.url || "").startsWith("/wisp")) {
    wisp.routeRequest(req, socket, head);
  } else if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

server.listen(PORT, () => {
  console.log("Relay server on http://localhost:" + PORT);
  console.log("Wisp endpoint: ws://localhost:" + PORT + "/wisp/");
});
