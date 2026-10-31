/* ==========================================================================
 * js/core/diagnostics.js
 * Console capture for Firebase permission warnings + client-side hardening
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// TEMP DIAGNOSTIC: prints the exact rule-evaluation reason for every denied write to the
// browser console (e.g. "Permission denied ... at /messages/global/-Ab.../text").
// Safe to leave on temporarily; remove enableLogging(true) once writes are confirmed fixed.
// enableLogging(true) removed: it dumped every DB event to the console, which froze/blacked-out
// low-power devices and embedded windows (VUS OS, launchers). Re-enable only while debugging.
// Capture Firebase's verbose "FIREBASE WARNING: ... permission_denied" rule-evaluation
// reason (normally only visible via enableLogging) so it can be shown in the toast itself.
// Only latch onto actual WARNING lines — plain "event:" value-dump logs are noise and were
// previously overwriting the real reason right after it appeared.
let _lastFbWarn='';
const _origConsoleLog=console.log,_origConsoleWarn=console.warn,_origConsoleError=console.error;
function _capture(...args){
  const s=args.map(a=>typeof a==='string'?a:(a&&a.message)||'').join(' ');
  if(/FIREBASE WARNING|permission_denied|PERMISSION_DENIED/i.test(s))_lastFbWarn=s;
}
console.log=function(...a){_capture(...a);_origConsoleLog.apply(console,a)};
console.warn=function(...a){_capture(...a);_origConsoleWarn.apply(console,a)};
console.error=function(...a){_capture(...a);_origConsoleError.apply(console,a)};
/* =====================================================================
   ITSUKI CHAT
   Structure:
     1. Config + validation
     2. DB layer (Firebase Realtime Database + Auth)
     3. Auth
     4. UI (pages, chat, settings, friends, rooms)
   Every record is keyed by numeric user ID, never by username.
   ===================================================================== */

/* ---------- 0. Client-side hardening (deterrent layer) ----------
   IMPORTANT: everything in this block can be bypassed by a determined person,
   because the browser belongs to the user. Real protection = the database rules.
   This just raises the effort and reloads the page when tampering is detected. */
(function(){
  // Only harden a normal top-level desktop tab. Inside an iframe / OS window / launcher,
  // on mobile, or in a popup, these checks give false positives (window size gaps, paused
  // debugger, console formatting) and the old code reloaded the page in a loop, which is
  // what left it stuck on the loading screen or turned VUS OS black.
  let framed=false;try{framed=window.self!==window.top}catch(_){framed=true}
  const mobile=/Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Macintosh/.test(navigator.userAgent));
  if(framed||mobile||window.opener)return;
  // Keyboard/right-click blocking only (no reload, so it can never loop)
  function hit(e){
    const k=(e.key||'').toLowerCase();
    const bad = e.key==='F12' ||
      (e.ctrlKey&&e.shiftKey&&['i','j','c','k','e'].includes(k)) ||
      (e.metaKey&&e.altKey&&['i','j','c','u'].includes(k)) ||
      (e.ctrlKey&&['u','s'].includes(k));
    if(bad){e.preventDefault();e.stopPropagation();return false}
  }
  window.addEventListener('keydown',hit,true);
  window.addEventListener('contextmenu',e=>{e.preventDefault()},true);
  // Removed: window-size-gap, `debugger` timing and console-getter detectors. They fire falsely
  // on zoom, side panels, extensions, embedded windows and slow devices, and their reload()
  // caused endless reload loops. Real protection is the database rules.
})();
