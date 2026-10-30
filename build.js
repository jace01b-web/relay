/* ===========================================================
   Relay — single-file build
   -----------------------------------------------------------
   Inlines every stylesheet and script into one HTML file, so a
   loader can fetch exactly one thing and write it into an
   about:blank document.

       node build.js            ->  dist/relay.html

   The multi-file version keeps working as it is; this is just a
   packed copy of it.
   =========================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "relay.html");

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}

/* a closing script tag inside inlined JS would end the block early */
function safeJs(src) {
  return src.replace(/<\/script>/gi, "<\\/script>");
}

let html = read("index.html");

/* stylesheets -> <style> (the font link stays remote and is optional) */
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">\n?/g, (m, href) => {
  return "<style>\n/* " + href + " */\n" + read(href).trim() + "\n</style>\n";
});

/* scripts -> inline, in the same order */
html = html.replace(/<script src="(js\/[^"]+)"><\/script>\n?/g, (m, src) => {
  return "<script>\n/* " + src + " */\n" + safeJs(read(src).trim()) + "\n</script>\n";
});

/* a marker so the app can tell it is the packed copy */
html = html.replace("<body ", '<body data-build="single" ');

/* only real tags count; the same words appear inside JS strings */
const leftovers = (html.match(/<(?:link|script|img|iframe)\b[^>]*?(?:href|src)="(?!https?:|data:|#)[^"]*"/gi) || [])
  .filter(Boolean);
if (leftovers.length) {
  console.warn("! still pointing at files on disk:", leftovers.join(", "));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log("built dist/relay.html  (" + kb + " KB, no external files)");
