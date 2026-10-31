/* Adds a "Download Launcher" item to the Extras menu on the home page.
   Reuses the existing .ex-item markup so the current extras CSS styles it. */
(function () {
  if (window.__dlLauncherInit) return;
  window.__dlLauncherInit = true;

  // Raw version of the GitHub "blob" link (the blob link only opens the GitHub page).
  var RAW_URL = "https://raw.githubusercontent.com/AniItsukiCoded/backups/main/(USE)%20-%20Launcher%20Loader.html";
  var FILE_NAME = "Launcher Loader.html";

  function addItem() {
    var menu = document.querySelector("#extrasMenu .ex-inner");
    if (!menu || document.getElementById("exLauncher")) return;

    var a = document.createElement("a");
    a.className = "ex-item";
    a.id = "exLauncher";
    a.setAttribute("role", "menuitem");
    a.setAttribute("tabindex", "-1");
    a.href = RAW_URL;
    a.innerHTML =
      '<span class="ex-ic" aria-hidden="true" style="background:linear-gradient(135deg,#7c6cff,#5a4bff)">' +
        '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14"/></svg>' +
      '</span>' +
      '<span class="ex-txt"><b>Download Launcher</b><small>Get the launcher file</small></span>' +
      '<span class="ex-go" aria-hidden="true"><svg viewBox="0 0 20 20" width="15" height="15"><path d="M10 3v10m0 0-4-4m4 4 4-4M4 17h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

    a.addEventListener("click", function (e) {
      e.preventDefault();
      var sub = a.querySelector("small");
      var old = sub ? sub.textContent : "";
      function say(t) { if (sub) sub.textContent = t; }
      function reset() { setTimeout(function () { say(old); }, 2500); }

      say("Downloading…");
      fetch(RAW_URL)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (t) {
          var url = URL.createObjectURL(new Blob([t], { type: "text/html" }));
          var d = document.createElement("a");
          d.href = url;
          d.download = FILE_NAME;
          document.body.appendChild(d);
          d.click();
          d.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          say("Downloaded!");
          reset();
        })
        .catch(function () {
          say("Opening file instead…");
          window.open(RAW_URL, "_blank", "noopener");
          reset();
        });
    });

    // Put it right under Zoom, above the Voice Channel card (and the "Sessions end" note).
    var note = menu.querySelector(".ex-group") || menu.querySelector(".ex-note");
    if (note) menu.insertBefore(a, note);
    else menu.appendChild(a);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addItem);
  else addItem();
})();
