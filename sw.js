/*global UVServiceWorker, __uv$config*/
/* ===========================================================
   The service worker. Every request the proxied page makes —
   scripts, XHR, fetch, images, fonts, media — lands here first,
   and Ultraviolet answers it by going out through the Wisp
   transport instead of the browser's own network stack.

   That is the difference between this and the relay modes: the
   page is not rewritten once and handed over, it keeps running
   with its own JavaScript, and every later request it makes is
   proxied too.
   =========================================================== */

importScripts("uv/uv.bundle.js");
importScripts("uv/uv.config.js");
importScripts(__uv$config.sw || "uv/uv.sw.js");

const uv = new UVServiceWorker();

async function handleRequest(event) {
  if (uv.route(event)) return await uv.fetch(event);
  return await fetch(event.request);
}

self.addEventListener("fetch", function (event) {
  event.respondWith(handleRequest(event));
});

/* take over as soon as it is installed, so the first page the
   person opens is already proxied */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
