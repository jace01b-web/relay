/* ===========================================================
   Relay — launcher home
   =========================================================== */

(function (FP) {
  "use strict";

  var store = FP.store, engine = FP.engine, shell = FP.shell;
  var wired = false;
  var $ = function (id) { return document.getElementById(id); };

  var MODE_LABELS = { page: "full page", reader: "reader", frame: "instance" };

  /* ---------- hero ---------- */

  function drawHero() {
    var s = store.all();
    var mark = $("hero-mark");
    mark.textContent = s.wordmark || "relay";
    if (s.theme === "strawberri") {
      var dot = document.createElement("span");
      dot.className = "berry-dot";
      dot.textContent = "🍓";
      mark.appendChild(dot);
    }
    $("hero-tag").textContent = s.tagline || "";
    $("hero-tag").style.display = s.tagline ? "" : "none";
  }

  /* ---------- tiles ---------- */

  function drawTiles() {
    var host = $("home-tiles");
    host.innerHTML = "";

    store.shortcuts().forEach(function (t) {
      var a = document.createElement("button");
      a.type = "button";
      a.className = "tile";
      a.title = t.url;

      var face = document.createElement("span");
      face.className = "face";
      face.textContent = (t.label || "?").charAt(0).toUpperCase();
      var icon = FP.tileIcon(engine.normalize(t.url));
      if (icon) {
        var img = new Image();
        img.alt = "";
        img.onload = function () { face.textContent = ""; face.appendChild(img); };
        img.src = icon;
      }

      var cap = document.createElement("span");
      cap.className = "cap";
      cap.textContent = t.label;

      a.appendChild(face);
      a.appendChild(cap);

      a.addEventListener("click", function () {
        FP.router.open(engine.normalize(t.url), store.get("mode"));
      });
      a.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        if (!confirm("Remove the " + t.label + " tile?")) return;
        store.removeShortcut(t.id);
        drawTiles();
        shell.toast(t.label + " removed", "good");
      });

      host.appendChild(a);
    });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "tile add";
    add.innerHTML = '<span class="face">+</span><span class="cap">add</span>';
    add.addEventListener("click", function () { openSheet("sheet-tile"); $("t-label").focus(); });
    host.appendChild(add);
  }

  /* ---------- readout ---------- */

  function drawReadout() {
    var s = store.all();
    var active = s.activeRelay === "auto" ? store.fastest(s.mode) : store.relay(s.activeRelay);
    var pings = store.pings();
    var p = active ? pings[active.id] : null;

    $("r-relay").textContent = active ? active.name.toLowerCase() : "none enabled";
    $("r-mode").textContent = MODE_LABELS[s.mode] || s.mode;

    var ping = $("r-ping");
    ping.className = p ? (p.ms > 0 ? "ok" : "bad") : "";
    ping.textContent = p ? (p.ms > 0 ? p.ms + "ms" : "no answer") : "untested";
  }

  /* ---------- relay sheet ---------- */

  function drawRack() {
    var mode = store.get("mode");
    var pings = store.pings();
    var active = store.get("activeRelay");
    var rack = $("rack");
    var usable = 0;

    rack.innerHTML = "";
    rack.appendChild(relayRow({
      id: "auto", name: "Fastest available",
      provider: "whichever answered quickest", kind: "auto"
    }, null, active === "auto", true, ""));

    store.relays().forEach(function (r) {
      var fits = engine.supports(r, mode);
      if (r.enabled && fits) usable++;
      var why = !r.enabled ? "off" : (!fits ? "not for " + MODE_LABELS[mode] : "");
      rack.appendChild(relayRow(r, pings[r.id], active === r.id, false, why));
    });

    $("relay-count").textContent = usable + " ready";
  }

  function relayRow(relay, ping, selected, isAuto, why) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "relay";
    b.setAttribute("aria-selected", selected ? "true" : "false");
    if (why) b.style.opacity = "0.45";

    b.innerHTML =
      '<span class="edge"></span>' +
      '<span class="body">' +
        '<span class="name">' + engine.escape(relay.name) +
          (why ? ' <span class="tag">' + engine.escape(why) + "</span>" : "") +
        "</span>" +
        '<span class="host">' + engine.escape(relay.provider || "") +
          (isAuto ? "" : " · " + (FP.KIND_LABELS[relay.kind] || relay.kind)) + "</span>" +
      "</span>" +
      '<span class="ping" data-state="' + (isAuto || !ping ? "" : (ping.ms < 0 ? "down" : "ok")) + '">' +
        (isAuto ? "—" : shell.pingText(ping)) + "</span>" +
      '<span class="gauge">' + (isAuto ? "" : shell.bars(ping ? ping.ms : null)) + "</span>";

    b.addEventListener("click", function () {
      store.set("activeRelay", relay.id);
      drawRack();
      drawReadout();
      shell.toast(isAuto ? "Using the fastest relay" : "Relay set to " + relay.name, "good");
    });

    li.appendChild(b);
    return li;
  }

  /* ---------- library sheet ---------- */

  function drawLibrary() {
    var list = store.history();
    var host = $("library");
    host.innerHTML = "";
    if (!list.length) {
      host.innerHTML = '<li><span class="meta" style="padding:10px 12px">Nothing opened yet.</span></li>';
      return;
    }
    list.forEach(function (h) {
      var li = document.createElement("li");
      var a = document.createElement("button");
      a.type = "button";
      a.innerHTML = engine.escape(h.title || engine.host(h.url)) +
        "<small>" + engine.escape(h.url) + "</small>";
      a.addEventListener("click", function () {
        closeSheet();
        FP.router.open(h.url, store.get("mode"));
      });
      var drop = document.createElement("button");
      drop.className = "drop";
      drop.type = "button";
      drop.textContent = "×";
      drop.setAttribute("aria-label", "Remove " + (h.title || h.url));
      drop.addEventListener("click", function () { store.dropHistory(h.url); drawLibrary(); });
      li.appendChild(a); li.appendChild(drop);
      host.appendChild(li);
    });
  }

  /* ---------- sheets ---------- */

  var openId = null;

  function openSheet(id) {
    closeSheet();
    openId = id;
    $("scrim").setAttribute("data-open", "1");
    $(id).setAttribute("data-open", "1");
  }

  function closeSheet() {
    if (openId) $(openId).setAttribute("data-open", "0");
    $("scrim").setAttribute("data-open", "0");
    openId = null;
  }

  $("scrim").addEventListener("click", closeSheet);
  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
    b.addEventListener("click", closeSheet);
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openId) { e.stopPropagation(); closeSheet(); }
  }, true);

  $("open-relays").addEventListener("click", function () { drawRack(); openSheet("sheet-relays"); });
  $("open-library").addEventListener("click", function () { drawLibrary(); openSheet("sheet-library"); });

  $("clear-library").addEventListener("click", function () {
    store.clearHistory();
    drawLibrary();
    shell.toast("Library cleared", "good");
  });

  $("tile-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var label = $("t-label").value.trim();
    var url = $("t-url").value.trim();
    if (!label || !url) { shell.toast("Both a name and an address, please.", "bad"); return; }
    store.upsertShortcut({ id: "t" + Date.now().toString(36), label: label, url: url });
    $("t-label").value = ""; $("t-url").value = "";
    drawTiles();
    closeSheet();
    shell.toast(label + " added", "good");
  });

  /* ---------- modes + search ---------- */

  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (chip) {
    chip.addEventListener("click", function () {
      store.set("mode", chip.dataset.mode);
      Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      drawReadout();
      drawTiles();
      if (openId === "sheet-relays") drawRack();
    });
  });

  $("dial").addEventListener("submit", function (e) {
    e.preventDefault();
    var url = engine.normalize($("home-addr").value);
    if (!url) { shell.toast("Type an address or a search.", "bad"); $("home-addr").focus(); return; }
    if (!store.chain(store.get("mode")).length) {
      shell.toast("No relay is enabled for this mode.", "bad");
      drawRack(); openSheet("sheet-relays");
      return;
    }
    FP.router.open(url, store.get("mode"));
  });

  /* ---------- decor ---------- */

  function paintDecor() {
    var mode = store.get("decor");
    var month = new Date().getMonth();           /* 9 = october */
    var spooky = store.get("theme") === "opium" &&
      (mode === "on" || (mode === "auto" && month === 9));
    document.documentElement.setAttribute("data-decor", spooky ? "spooky" : "plain");
    $("decor-layer").style.display = mode === "off" ? "none" : "";
  }

  /* the lime blob leans toward the pointer on the strawberri skin */
  window.addEventListener("pointermove", function (e) {
    if (store.get("theme") !== "strawberri") return;
    var x = (e.clientX / window.innerWidth - 0.5) * 2;
    var y = (e.clientY / window.innerHeight - 0.5) * 2;
    document.documentElement.style.setProperty("--px", x.toFixed(3));
    document.documentElement.style.setProperty("--py", y.toFixed(3));
  }, { passive: true });

  /* ---------- test all ---------- */

  $("tray-test-all").addEventListener("click", function () {
    var list = store.enabledRelays().filter(function (r) { return r.kind !== "frame"; });
    if (!list.length) { shell.toast("No relays to test.", "bad"); return; }
    var btn = $("tray-test-all");
    btn.disabled = true; btn.textContent = "Testing…";
    var done = 0, alive = 0;
    list.forEach(function (r) {
      engine.ping(r).then(function (ms) {
        done++; if (ms > 0) alive++;
        drawRack(); drawReadout();
        if (done === list.length) {
          btn.disabled = false; btn.textContent = "Test all";
          shell.toast(alive + " of " + list.length + " relays answered", alive ? "good" : "bad");
        }
      });
    });
  });

  /* ---------- view ---------- */

  FP.home = {
    init: function () {
      wired = true;
      paintDecor();
      drawHero();
      drawTiles();
      drawReadout();
      var mode = store.get("mode");
      Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
        c.setAttribute("aria-pressed", c.dataset.mode === mode ? "true" : "false");
      });

      /* opened straight from a file: several relays will refuse it */
      if (engine.fromFile()) {
        setTimeout(function () {
          shell.toast("Opened from a file, so relays see no origin and most will refuse. Serve the folder or use your launcher.", "bad");
        }, 900);
      }
    },

    /* shown again: settings may have changed underneath */
    enter: function () {
      if (!wired) return;
      paintDecor();
      drawHero();
      drawTiles();
      drawReadout();
      closeSheet();
      $("home-addr").focus();
    }
  };
})(window.FP);
