/* ==========================================================================
 * js/games/game-hubs.js
 * "Games have moved" panel.
 *
 * The games, hubs, proxies and the in-site iframe viewer used to live here. They are gone on
 * purpose: everything is played through the official launcher now, which is the only thing that
 * reliably survives school filters and about:blank-closing.
 *
 * The buttons that open this are still called Games, on purpose — somebody looking for the games
 * goes looking for "Games", and this panel is how they find out where they went. All it does is
 * explain the move and point at the launcher list.
 *
 * modalGameHubs() / closeGameHubs() keep their names because the home tile, the Discord-look rail
 * and the Escape-key handler all call them.
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * ========================================================================== */
'use strict';

const LAUNCHER_README='https://github.com/AniItsukiCoded/readme/blob/main/readme.md';
const LAUNCHER_DOWNLOAD='https://github.com/AniItsukiCoded/backups/blob/main/(USE)%20-%20Launcher%20Loader.html';
const DISCORD_HELP='https://discord.gg/MV8RD9XzvA';

function modalGameHubs(){
  $('#modalRoot').innerHTML=`<div class="modal-bg" id="ghBg"><div class="modal lch-modal">
    <button class="modal-x" id="ghX" type="button" aria-label="Close">✕</button>
    <h2>🎮 Games have moved</h2>
    <div class="hint">Games, proxies and apps are in the <b>launcher</b> now, not in here. The launcher opens them in a way school networks don't close, and the list below always has a mirror that still works.</div>

    <a class="lch-main" href="${LAUNCHER_README}" target="_blank" rel="noopener noreferrer">
      <span class="lch-ic" aria-hidden="true">🚀</span>
      <span class="lch-tx"><b>Official launcher list</b><small>Every working launcher, kept up to date. Start here.</small></span>
      <span class="lch-go" aria-hidden="true">↗</span>
    </a>

    <div class="lch-row">
      <a class="lch-sec" href="${LAUNCHER_DOWNLOAD}" target="_blank" rel="noopener noreferrer">
        <span class="lch-ic sm" aria-hidden="true">⬇</span>
        <span class="lch-tx"><b>Download the launcher</b><small>One file you keep on your device</small></span>
      </a>
      <a class="lch-sec" href="${DISCORD_HELP}" target="_blank" rel="noopener noreferrer">
        <span class="lch-ic sm" aria-hidden="true">💬</span>
        <span class="lch-tx"><b>All of them blocked?</b><small>Ask in the Discord — new mirrors go up there first</small></span>
      </a>
    </div>

    <div class="lch-note">You can also get the launcher from <b>Extras → Download Launcher</b> on the home screen.</div>
  </div></div>`;
  $('#ghX').onclick=closeGameHubs;
  $('#ghBg').onclick=e=>{if(e.target.id==='ghBg')closeGameHubs()};
}

// Plays the same fade/scale-down exit the rest of the modals use (see .modal-bg.closing)
// instead of yanking the panel out instantly.
function closeGameHubs(){
  const bg=$('#ghBg');if(!bg){if($('#modalRoot'))$('#modalRoot').innerHTML='';return}
  bg.classList.add('closing');
  setTimeout(()=>{if($('#modalRoot'))$('#modalRoot').innerHTML=''},200);
}
