/* ==========================================================================
 * js/core/helpers.js
 * Tiny DOM helpers: $, esc, avatarHtml
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// An avatar is a base64 JPEG data URL the person uploaded, and it goes straight into an img src.
// It arrives from the database, so it is somebody else's string: anything that is not exactly a
// JPEG data URL is dropped and they get the letter initial instead. Without this, a value like
//   data:image/jpeg;base64," onerror="...
// still satisfies the "starts with data:image/jpeg;base64," database rule, but breaks out of the
// src attribute and runs for every person who sees that avatar. (Profile banners already do this
// — see isSafeBannerImg() in js/ui/controls.js.)
function isSafeAvatarImg(s){
  return typeof s==='string'&&s.length>30&&s.length<=600000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
}
// Renders a user's avatar: their uploaded picture if set, else a letter initial.
// extraStyle lets callers override size/font-size while keeping the base .avatar class.
function avatarHtml(user,name,extraStyle){
  const raw=user&&user.settings&&user.settings.avatar;
  const img=isSafeAvatarImg(raw)?raw:'';
  const style=extraStyle||'';
  if(img)return `<div class="avatar" style="${style};background:none;padding:0;overflow:hidden"><img src="${esc(img)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"></div>`;
  return `<div class="avatar" style="${style}">${esc((name||'?')[0].toUpperCase())}</div>`;
}
