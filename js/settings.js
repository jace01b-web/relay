/* ===========================================================
   Relay — settings page
   =========================================================== */

(function (FP) {
  "use strict";

  var store = FP.store, engine = FP.engine, shell = FP.shell;
  var $ = function (id) { return document.getElementById(id); };

  var THEMES = [
    { id: "opium", name: "Opium", base: "linear-gradient(170deg,#1d1030,#140a20 60%,#2a1420)", accent: "#ff9a4d" },
    { id: "strawberri", name: "Strawberri", base: "radial-gradient(120% 90% at 60% 10%,#2b0808,#0b0404 70%)", accent: "#ff2b52" },
    { id: "console", name: "Console", base: "linear-gradient(170deg,#16203c,#11182b)", accent: "#f7a93b" }
  ];

  var editing = null; /* relay id being edited, or null for a new one */

  /* ---------- simple bound controls ---------- */

  var toggles = ["failover", "stripScripts", "blockImages", "keepHistory"];
  var selects = ["timeout", "mode", "searchEngine", "openIn", "density", "panicKey", "decor", "assets", "transport"];
  var texts = ["tabTitle", "tabIcon", "panicUrl", "wordmark", "tagline", "wisp", "bare"];

  function bind() {
    toggles.forEach(function (key) {
      var box = $(key);
      box.checked = !!store.get(key);
      box.addEventListener("change", function () {
        store.set(key, box.checked);
        shell.paint();
        shell.toast(label(key) + (box.checked ? " on" : " off"), "good");
      });
    });

    selects.forEach(function (key) {
      var sel = $(key);
      var val = store.get(key);
      sel.value = key === "timeout" ? String(val) : (val == null ? "" : val);
      sel.addEventListener("change", function () {
        store.set(key, key === "timeout" ? parseInt(sel.value, 10) : sel.value);
        if (key === "transport" && FP.uv) FP.uv.retransport();
        shell.paint();
        drawRelayPicker();
        shell.toast(label(key) + " saved", "good");
      });
    });

    texts.forEach(function (key) {
      var input = $(key);
      input.value = store.get(key) || "";
      input.addEventListener("change", function () {
        store.set(key, input.value.trim());
        shell.paint();
        if ((key === "wisp" || key === "bare") && FP.uv) FP.uv.retransport();
        shell.toast(label(key) + " saved", "good");
      });
    });
  }

  function label(key) {
    return ({
      failover: "Relay fallback", stripScripts: "Script removal", blockImages: "Image skipping",
      keepHistory: "Recent list", timeout: "Timeout", mode: "Default mode",
      searchEngine: "Search engine", openIn: "Open location", density: "Density",
      panicKey: "Escape key", tabTitle: "Tab title", tabIcon: "Tab icon",
      panicUrl: "Escape address", decor: "Backdrop", wordmark: "Wordmark",
      tagline: "Tagline", assets: "Image loading", wisp: "Wisp server", bare: "Bare server", transport: "Transport"
    })[key] || key;
  }

  /* ---------- relay picker ---------- */

  function drawRelayPicker() {
    var sel = $("activeRelay");
    var mode = store.get("mode");
    sel.innerHTML = "";
    var auto = document.createElement("option");
    auto.value = "auto";
    auto.textContent = "fastest available";
    sel.appendChild(auto);
    store.relays().forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name + (r.enabled ? "" : " (off)") +
        (engine.supports(r, mode) ? "" : " — not for " + mode);
      sel.appendChild(o);
    });
    sel.value = store.get("activeRelay");
    sel.onchange = function () {
      store.set("activeRelay", sel.value);
      shell.toast("Relay saved", "good");
    };
  }

  /* ---------- relay list ---------- */

  function drawRelays() {
    var host = $("relay-rows");
    var pings = store.pings();
    host.innerHTML = "";

    store.relays().forEach(function (r) {
      var li = document.createElement("li");
      li.className = "relay-row" + (r.enabled ? "" : " is-off");

      var order = document.createElement("div");
      order.className = "order";
      order.innerHTML = "<button type='button' data-move='-1' aria-label='Move up'>▲</button>" +
                        "<button type='button' data-move='1' aria-label='Move down'>▼</button>";

      var info = document.createElement("div");
      info.className = "info";
      var p = pings[r.id];
      info.innerHTML = "<strong>" + engine.escape(r.name) + "</strong> " +
        '<span class="tag' + (p && p.ms > 0 ? " tag-live" : (p ? " tag-down" : "")) + '">' +
        (FP.KIND_LABELS[r.kind] || r.kind) + (p ? " · " + shell.pingText(p) : "") + "</span>" +
        "<code>" + engine.escape(r.template) + "</code>";

      var acts = document.createElement("div");
      acts.className = "acts";
      acts.innerHTML =
        "<button class='btn btn-sm btn-ghost' data-act='toggle'>" + (r.enabled ? "Off" : "On") + "</button>" +
        "<button class='btn btn-sm btn-ghost' data-act='ping'>Test</button>" +
        "<button class='btn btn-sm btn-ghost' data-act='edit'>Edit</button>" +
        "<button class='btn btn-sm btn-ghost' data-act='drop'>Remove</button>";

      li.appendChild(order);
      li.appendChild(info);
      li.appendChild(acts);
      host.appendChild(li);

      order.addEventListener("click", function (e) {
        var b = e.target.closest("[data-move]");
        if (!b) return;
        store.moveRelay(r.id, parseInt(b.dataset.move, 10));
        drawRelays();
        drawRelayPicker();
      });

      acts.addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]");
        if (!b) return;
        var act = b.dataset.act;

        if (act === "toggle") {
          store.upsertRelay({ id: r.id, enabled: !r.enabled });
          drawRelays(); drawRelayPicker();
          shell.toast(r.name + (r.enabled ? " turned off" : " turned on"), "good");
        }
        else if (act === "ping") {
          b.textContent = "…"; b.disabled = true;
          engine.ping(r).then(function (ms) {
            drawRelays();
            shell.toast(r.name + (ms > 0 ? " answered in " + ms + " ms" : " did not answer"), ms > 0 ? "good" : "bad");
          });
        }
        else if (act === "edit") { openEditor(r); }
        else if (act === "drop") {
          store.removeRelay(r.id);
          drawRelays(); drawRelayPicker();
          shell.toast(r.name + " removed", "good");
        }
      });
    });
  }

  /* ---------- relay editor ---------- */

  function openEditor(relay) {
    editing = relay ? relay.id : null;
    $("editor-title").textContent = relay ? "Edit " + relay.name : "Add a relay";
    $("r-name").value = relay ? relay.name : "";
    $("r-kind").value = relay ? relay.kind : "raw";
    $("r-template").value = relay ? relay.template : "";
    $("r-encode").checked = relay ? !!relay.encode : true;
    $("r-name").focus();
    $("editor").scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function clearEditor() {
    editing = null;
    $("editor-title").textContent = "Add a relay";
    $("r-name").value = "";
    $("r-template").value = "";
    $("r-kind").value = "raw";
    $("r-encode").checked = true;
  }

  function readEditor() {
    var name = $("r-name").value.trim();
    var template = $("r-template").value.trim();
    if (!name) { shell.toast("Give the relay a name.", "bad"); return null; }
    if (!template && $("r-kind").value !== "direct") {
      shell.toast("Add the endpoint address.", "bad"); return null;
    }
    return {
      id: editing || ("custom-" + Date.now().toString(36)),
      name: name,
      provider: hostOf(template),
      kind: $("r-kind").value,
      template: template || "%URL%",
      encode: $("r-encode").checked,
      note: "Added by you.",
      enabled: true,
      builtin: false
    };
  }

  function hostOf(t) {
    try { return new URL(t.replace("%URL%", "")).host; } catch (e) { return "custom"; }
  }

  $("r-save").addEventListener("click", function () {
    var relay = readEditor();
    if (!relay) return;
    store.upsertRelay(relay);
    drawRelays(); drawRelayPicker();
    shell.toast(relay.name + " saved", "good");
    clearEditor();
  });

  $("r-cancel").addEventListener("click", clearEditor);

  $("r-test").addEventListener("click", function () {
    var relay = readEditor();
    if (!relay) return;
    var btn = $("r-test");
    btn.disabled = true; btn.textContent = "Testing…";
    engine.ping(relay).then(function (ms) {
      btn.disabled = false; btn.textContent = "Test this endpoint";
      shell.toast(ms > 0 ? "Answered in " + ms + " ms" : "No answer from that endpoint", ms > 0 ? "good" : "bad");
    });
  });

  $("test-all").addEventListener("click", function () {
    var list = store.relays().filter(function (r) { return r.kind !== "frame"; });
    var btn = $("test-all");
    btn.disabled = true; btn.textContent = "Testing…";
    var done = 0, alive = 0;
    list.forEach(function (r) {
      engine.ping(r).then(function (ms) {
        done++; if (ms > 0) alive++;
        if (done === list.length) {
          btn.disabled = false; btn.textContent = "Test all";
          drawRelays();
          shell.toast(alive + " of " + list.length + " relays answered", alive ? "good" : "bad");
        }
      });
    });
  });

  $("restore").addEventListener("click", function () {
    store.restoreRelays();
    drawRelays(); drawRelayPicker();
    shell.toast("Built-in relays restored", "good");
  });

  /* ---------- themes ---------- */

  function drawSwatches() {
    var host = $("swatches");
    var active = store.get("theme");
    host.innerHTML = "";
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch";
      b.setAttribute("aria-pressed", t.id === active ? "true" : "false");
      b.setAttribute("aria-label", t.name + " theme");
      b.title = t.name;
      b.innerHTML = "<span style='background:" + t.base + "'></span>" +
        "<i style='background:" + t.accent + "'></i>" +
        "<small style='color:#ffffff99'>" + t.name.toLowerCase() + "</small>";
      b.addEventListener("click", function () {
        store.set("theme", t.id);
        shell.paint();
        drawSwatches();
        if (FP.home && FP.home.enter) FP.home.enter();
      });
      host.appendChild(b);
    });
  }

  /* ---------- tiles ---------- */

  function drawTiles() {
    var host = $("tile-rows");
    host.innerHTML = "";
    var list = store.shortcuts();

    if (!list.length) {
      host.innerHTML = '<li class="empty"><strong>No tiles</strong>The home page will show only the search bar.</li>';
      return;
    }

    list.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "relay-row";

      var order = document.createElement("div");
      order.className = "order";
      order.innerHTML = "<button type='button' data-move='-1' aria-label='Move up'>▲</button>" +
                        "<button type='button' data-move='1' aria-label='Move down'>▼</button>";

      var info = document.createElement("div");
      info.className = "info";
      info.innerHTML = "<strong>" + engine.escape(t.label) + "</strong><code>" +
        engine.escape(t.url) + "</code>";

      var acts = document.createElement("div");
      acts.className = "acts";
      acts.innerHTML = "<button class='btn btn-sm btn-ghost' data-act='rename'>Rename</button>" +
                       "<button class='btn btn-sm btn-ghost' data-act='drop'>Remove</button>";

      order.addEventListener("click", function (e) {
        var b = e.target.closest("[data-move]");
        if (!b) return;
        store.moveShortcut(t.id, parseInt(b.dataset.move, 10));
        drawTiles();
      });

      acts.addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]");
        if (!b) return;
        if (b.dataset.act === "drop") {
          store.removeShortcut(t.id);
          drawTiles();
          shell.toast(t.label + " removed", "good");
        } else {
          var name = prompt("Name for this tile", t.label);
          if (name == null) return;
          var url = prompt("Address", t.url);
          if (url == null) return;
          store.upsertShortcut({ id: t.id, label: name.trim() || t.label, url: url.trim() || t.url });
          drawTiles();
          shell.toast("Tile updated", "good");
        }
      });

      li.appendChild(order); li.appendChild(info); li.appendChild(acts);
      host.appendChild(li);
    });
  }

  $("nt-save").addEventListener("click", function () {
    var label = $("nt-label").value.trim();
    var url = $("nt-url").value.trim();
    if (!label || !url) { shell.toast("A name and an address, please.", "bad"); return; }
    store.upsertShortcut({ id: "t" + Date.now().toString(36), label: label, url: url });
    $("nt-label").value = ""; $("nt-url").value = "";
    drawTiles();
    shell.toast(label + " added", "good");
  });

  $("restore-tiles").addEventListener("click", function () {
    store.restoreShortcuts();
    drawTiles();
    shell.toast("Default tiles restored", "good");
  });

  /* ---------- data ---------- */

  function drawHistCount() {
    var n = store.history().length;
    $("hist-count").textContent = n ? n + " saved in this browser" : "nothing saved";
  }

  $("clear-history").addEventListener("click", function () {
    store.clearHistory();
    drawHistCount();
    shell.toast("Recent list cleared", "good");
  });

  $("export").addEventListener("click", function () {
    var blob = new Blob([store.exportJson()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relay-settings.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    shell.toast("Settings file downloaded", "good");
  });

  $("import-btn").addEventListener("click", function () { $("import-file").click(); });

  $("import-file").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        store.importJson(String(reader.result));
        shell.toast("Settings imported", "good");
        FP.settings.init();
        shell.paint();
      } catch (err) {
        shell.toast("That file could not be read as a Relay config.", "bad");
      }
    };
    reader.readAsText(file);
  });

  $("reset").addEventListener("click", function () {
    if (!confirm("Reset every setting and restore the default relay list?")) return;
    store.reset();
    store.clearHistory();
    shell.toast("Back to defaults", "good");
    FP.settings.init();
    shell.paint();
  });

  /* ---------- section highlighting ---------- */

  function tocWatch() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".toc a"));
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a, i) {
          a.classList.toggle("active", sections[i] === entry.target);
        });
      });
    }, { rootMargin: "-80px 0px -70% 0px" });
    sections.forEach(function (s) { if (s) io.observe(s); });
  }

  /* ---------- view ---------- */

  FP.settings = {
    init: function () {
      bind();
      drawRelays();
      drawRelayPicker();
      drawSwatches();
      drawTiles();
      drawHistCount();
      tocWatch();
      if (!store.persists()) {
        shell.toast("This window cannot save settings, so they last until you close it.", "info");
      }
    },
    enter: function () {
      drawRelays();
      drawRelayPicker();
      drawHistCount();
    }
  };
})(window.FP);
