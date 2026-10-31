/* ==========================================================================
 * js/core/auto-update.js
 * Auto-update poller and owner-pinned forced version lock
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Auto-update: keep everyone on the latest deployed version ---------- */
// Periodically re-fetches this page (bypassing cache) and compares the
// build-version meta tag against the one this tab actually loaded with. If a
// new version has been published, everyone still sitting on the old tab gets
// nudged to refresh instead of silently running stale code indefinitely.
const MY_BUILD=document.querySelector('meta[name="build-version"]')?.content||'';
let updatePending=false;
// Re-fetches this page (bypassing cache) and pulls out the build-version meta tag it's
// actually serving right now — i.e. what's really deployed, as opposed to MY_BUILD (what
// this tab happened to load with) or appVersion/current (whatever an owner last typed).
// Shared by the soft poller below and by the Moderation > Version control panel, so the
// panel can show an owner what's genuinely live before they pin it as canonical.
async function fetchDeployedBuild(){
  if(!/^https?:$/.test(location.protocol)||window.opener)return null; // launcher/blob/about:blank windows: nothing to re-fetch
  try{
    const res=await fetch(location.pathname+location.search+(location.search?'&':'?')+'_v='+Date.now(),{cache:'no-store'});
    if(!res.ok)return null;
    const html=await res.text();
    const m=html.match(/<meta\s+name=["']build-version["']\s+content=["']([^"']+)["']/i);
    return m?m[1]:null;
  }catch(_){return null;/* offline, or the file:// / hosting setup blocks this */}
}
async function checkForUpdate(){
  if(updatePending||!MY_BUILD)return;
  const latest=await fetchDeployedBuild();
  if(latest&&latest!==MY_BUILD){
    updatePending=true;
    toast('A new version is available — refreshing…');
    setTimeout(()=>location.reload(),1800);
  }
}
setInterval(checkForUpdate,120000);                 // poll every 2 minutes
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate()});
window.addEventListener('focus',checkForUpdate);
/* ---------- Forced update: owner-pinned version, enforced for everyone ---------- */
// checkForUpdate() above is a soft nudge that only fires once a *new file* is actually
// deployed and gets re-fetched. This is the owner-controlled companion: appVersion/current
// in the database (see Moderation > 🚀 Version control) is a version label an owner explicitly
// pinned as canonical. Every signed-in client compares its own MY_BUILD against that live
// value; if they don't match, non-owners get hard-locked out of the app entirely (can't
// read, send, or do anything else) until they're back on the matching build — this is what
// actually stops stragglers on old (or premature, not-yet-pinned) cached tabs from acting on
// stale code. Owners are deliberately exempt from the lock, so an owner running a mismatched
// build can still get into Moderation > Version control to fix the pin themselves.
let forcedUpdatePending=false;
const FORCED_VER_KEY='forcedVerAttempt';
const OLD_VER_DISCORD='https://discord.gg/dkF4HtXWQ';
// Best-effort direction check for two "YYYY-MM-DD.N" build labels (what the auto-bumped
// build-version tag looks like). Version labels are free text an owner can type anything
// into, so this can't always tell — returns null when either label doesn't match that shape,
// and callers fall back to direction-agnostic copy in that case.
function compareBuilds(a,b){
  const re=/^(\d{4}-\d{2}-\d{2})\.(\d+)$/;
  const ma=a&&a.match(re),mb=b&&b.match(re);
  if(!ma||!mb)return null;
  if(ma[1]!==mb[1])return ma[1]<mb[1]?-1:1;
  const na=parseInt(ma[2],10),nb=parseInt(mb[2],10);
  return na===nb?0:(na<nb?-1:1);
}
function checkForcedVersion(){
  if(!MY_BUILD||!APP_VERSION_LOADED)return;
  const cur=APP_VERSION_CACHE&&APP_VERSION_CACHE.current;
  const mismatched=!!(cur&&cur!==MY_BUILD);
  // Don't lock (or exempt) anyone until owners/ has actually loaded — OWNERS_CACHE starts
  // empty, so isOwner() would false-negative a real owner and lock them out incorrectly.
  if(mismatched&&!ownersKnown())return;
  const amOwner=isOwner(ME&&ME.id);
  if(!mismatched||amOwner){
    // Either both builds agree, or this client is an owner and is exempt from the lock —
    // clear any pending retry/lock state either way.
    try{sessionStorage.removeItem(FORCED_VER_KEY)}catch(_){}
    unlockVersionMismatch();
    hideOwnerVersionHeadsUp();
    if(mismatched&&amOwner)showOwnerVersionHeadsUp(cur); // gentle, non-blocking reminder to fix the pin
    return;
  }
  // Non-owner and mismatched: lock the whole app immediately — this is the "can't do
  // anything" state — then keep trying to recover automatically underneath it.
  lockForVersionMismatch(cur);
  if(forcedUpdatePending)return;
  if(!/^https?:$/.test(location.protocol)||window.opener){
    // Nothing sane to reload() into (launcher / about:blank / blob window) — this tab can
    // never self-fix. The lock screen already tells them to relaunch or ask on Discord.
    return;
  }
  // Loop guard: a reload can only ever fix this if a build matching `cur` is actually
  // deployed. If an owner pinned a version that never got deployed (typo, or pushed the
  // label before the new file went live), MY_BUILD will keep disagreeing forever and this
  // would otherwise reload the tab every couple seconds, indefinitely, for every visitor.
  // Cap it at a few tries per target version, then just leave the lock screen up.
  let attempts=0;
  try{
    const rec=JSON.parse(sessionStorage.getItem(FORCED_VER_KEY)||'null');
    if(rec&&rec.v===cur)attempts=rec.n||0;
  }catch(_){}
  if(attempts>=3)return;
  try{sessionStorage.setItem(FORCED_VER_KEY,JSON.stringify({v:cur,n:attempts+1}));}catch(_){}
  forcedUpdatePending=true;
  setTimeout(()=>location.reload(),1800);
}
let versionLockEl=null,versionLockPrevOverflow=null;
// Full-screen, non-dismissable block for a non-owner whose build doesn't match the
// owner-pinned version — covers the whole viewport so nothing underneath is reachable
// (no clicks land on it, and any element that already had focus gets blurred so stray
// keystrokes don't reach it either).
function lockForVersionMismatch(cur){
  if(versionLockEl)return;
  const dir=compareBuilds(MY_BUILD,cur);
  const label=dir===-1?'an older version':dir===1?"a version that hasn't been officially pushed out yet":'a different version than what\'s currently live';
  const overlay=document.createElement('div');
  overlay.id='verLockOverlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(10,6,3,.94);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center';
  overlay.innerHTML=`<div style="max-width:440px;background:#2a1a0d;border:1px solid #6b4a1a;border-radius:16px;padding:28px 24px;color:#ffdca8;box-shadow:0 20px 60px rgba(0,0,0,.5)">
    <div style="font-size:32px;margin-bottom:10px">⚠️</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:10px">You're on ${label}</div>
    <div style="font-size:13.5px;line-height:1.55;opacity:.92">The site is currently running <b>${esc(cur)}</b>, but this tab loaded <b>${esc(MY_BUILD)||'an unknown build'}</b>. You can't use the chat from here until that's sorted out — please relaunch the website to load the current version, or <a href="${OLD_VER_DISCORD}" target="_blank" rel="noopener noreferrer" style="color:#ffdca8;text-decoration:underline">join the Discord</a> if it keeps happening.</div>
    <button class="btn sec small" id="verLockRetry" style="margin-top:18px">Try again</button>
  </div>`;
  document.body.appendChild(overlay);
  versionLockEl=overlay;
  versionLockPrevOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  if(document.activeElement&&!overlay.contains(document.activeElement))document.activeElement.blur();
  document.addEventListener('keydown',trapKeyIfLocked,true);
  document.addEventListener('focusin',trapFocusIfLocked,true);
  overlay.querySelector('#verLockRetry').onclick=()=>{try{sessionStorage.removeItem(FORCED_VER_KEY)}catch(_){}location.reload()};
}
function unlockVersionMismatch(){
  if(!versionLockEl)return;
  versionLockEl.remove();versionLockEl=null;
  document.body.style.overflow=versionLockPrevOverflow||'';
  document.removeEventListener('keydown',trapKeyIfLocked,true);
  document.removeEventListener('focusin',trapFocusIfLocked,true);
}
function trapKeyIfLocked(e){if(versionLockEl&&!versionLockEl.contains(e.target)){e.stopPropagation();e.preventDefault()}}
function trapFocusIfLocked(e){if(versionLockEl&&!versionLockEl.contains(e.target)){e.stopPropagation();document.activeElement&&document.activeElement!==document.body&&document.activeElement.blur()}}
let ownerVerHeadsUpEl=null;
function hideOwnerVersionHeadsUp(){if(ownerVerHeadsUpEl){ownerVerHeadsUpEl.remove();ownerVerHeadsUpEl=null}}
// Small, non-blocking heads-up shown only to owners (who are exempt from the lock above)
// when their own tab doesn't match the pinned version — a nudge to go fix the pin, not a
// wall, since owners specifically need to stay able to use the app to push the fix.
function showOwnerVersionHeadsUp(cur){
  if(ownerVerHeadsUpEl)return;
  const bg=document.createElement('div');
  bg.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;max-width:560px;margin:0 auto;background:#3a2410;border:1px solid #6b4a1a;color:#ffdca8;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  bg.innerHTML=`<div style="flex:1;min-width:200px">⚠️ Your build doesn't match the pinned version ("${esc(cur)}"). You're an owner, so you're not locked out like everyone else would be — but go to Moderation ▸ Version control to push the right version.</div>`;
  document.body.appendChild(bg);
  ownerVerHeadsUpEl=bg;
}
