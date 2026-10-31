/*global Ultraviolet*/
/* ===========================================================
   Ultraviolet config, written so the site can live anywhere —
   a domain root, a /relay/ subpath on GitHub Pages, whatever.
   Every path is worked out from where this file actually sits
   instead of being hard-coded to "/".
   =========================================================== */

(function () {
  var base;

  if (typeof document !== "undefined" && document.currentScript) {
    /* in a page: this file is at <site>/uv/uv.config.js */
    base = new URL(".", document.currentScript.src);
  } else {
    /* in the service worker: sw.js sits at the SITE ROOT, so that its
       scope covers the whole site. A proxied page that links to an
       absolute path like /login has to stay inside that scope, or the
       browser goes straight to the network and the proxy is bypassed. */
    base = new URL("uv/", self.location.href);
  }

  var at = function (file) { return new URL(file, base).pathname; };
  var site = function (file) { return new URL("../" + file, base).pathname; };

  self.__uv$config = {
    prefix: site("service/"),
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: at("uv.handler.js"),
    client: at("uv.client.js"),
    bundle: at("uv.bundle.js"),
    config: at("uv.config.js"),
    sw: at("uv.sw.js")
  };
})();
