/* Runs worker/bare-worker.js on your own machine, for trying it out
   before (or instead of) putting it on Cloudflare.

       node worker/run-local.mjs            -> http://localhost:8081/bare/

   Needs Node 18+. ALLOW_PRIVATE=1 lets it reach sites on your own
   network, which is only for testing.                              */

import { createServer } from "node:http";
import { handle } from "./bare-worker.js";

const PORT = process.env.PORT || 8081;
const env = { ALLOW_PRIVATE: process.env.ALLOW_PRIVATE };

createServer(async (req, res) => {
  const url = "http://" + (req.headers.host || "localhost") + req.url;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach(one => headers.append(k, one));
    else if (v != null) headers.set(k, v);
  }

  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }

  const response = await handle(new Request(url, { method: req.method, headers, body }), env);
  const out = {};
  response.headers.forEach((value, key) => { out[key] = value; });
  res.writeHead(response.status, out);
  if (response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } else res.end();
}).listen(PORT, () => console.log("bare worker on http://localhost:" + PORT + "/bare/"));
