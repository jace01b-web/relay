/* ==========================================================================
 * js/settings/appearance.js
 * Personal style: fonts, bubbles, chat background
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Style (personal, only visible to this user) ---------- */
const FONTS={
  system:'system-ui,-apple-system,Segoe UI,sans-serif',
  serif:'Georgia,"Times New Roman",serif',
  mono:'ui-monospace,Menlo,Consolas,monospace',
  rounded:'"Trebuchet MS","Comic Sans MS",cursive,sans-serif',
  impact:'Impact,"Arial Black",sans-serif'
};
function bgCSS(s){
  if(s.bgType==='color')return s.bgColor;
  if(s.bgType==='gradient')return `radial-gradient(130% 90% at 12% -10%,${hexToRgba(s.bgColor,.55)},transparent 55%),radial-gradient(130% 90% at 100% 112%,${hexToRgba(s.bgColor2,.55)},transparent 58%),linear-gradient(150deg,${s.bgColor},${s.bgColor2})`;
  if(s.bgType==='image'&&s.bgImage)return `url("${s.bgImage}")`;
  return '';
}
// Paints a background into a {layer,dim} pair. The layer is oversized (inset:-Npx) and its parent clips it,
// so blur never bleeds white edges and never spills off screen.
function paintBg(layer,dim,s){
  const css=bgCSS(s);
  // The real app background (not the settings preview): flag when a personal IMAGE is active so the Halloween skin lets it show.
  if(layer.id==='bgLayer')document.documentElement.classList.toggle('has-bg-img',!!(css&&s.bgType==='image'));
  if(!css){layer.style.background='';layer.style.filter='none';dim.style.opacity=0;return}
  layer.style.background=css;
  layer.style.backgroundSize=(s.bgType==='image'&&s.bgFit==='contain')?'contain':'cover';
  layer.style.backgroundRepeat='no-repeat';layer.style.backgroundPosition='center';
  layer.style.filter=s.bgType==='image'&&s.bgBlur>0?`blur(${s.bgBlur}px)`:'none';
  dim.style.opacity=(s.bgDim||0)/100;
}
/* renderChat() calls applyStyle() on every re-render, and a re-render happens on every database
   change. Re-writing a dozen custom properties on <html> (plus repainting the background layer)
   invalidates style for the whole document, so doing it when nothing actually changed was a steady
   drip of wasted work during busy chat. The app-wide call is now a no-op unless something it
   depends on really changed — the live settings preview still applies every time, because it
   passes draft settings (a different signature) or a different target. */
let _styleApplySig='';
function styleSig(s){
  return JSON.stringify([s.meBubble,s.meText,s.radius,s.font,FONTS[s.font]||FONTS.system,s.size,s.bold,s.italic,
    s.bgType,s.bgColor,s.bgColor2,s.bgFit,s.bgBlur,s.bgDim,s.bgImage?s.bgImage.length:0,
    s.uiOpacity,s.uiBlur,typeof DiscordLook!=='undefined'&&DiscordLook.on()]);
}
function applyStyle(target=document.documentElement,s=ME.settings){
  if(target===document.documentElement){
    const sig=styleSig(s);
    if(sig===_styleApplySig)return;
    _styleApplySig=sig;
  }
  target.style.setProperty('--b-me',hexToRgba(s.meBubble,.6));
  target.style.setProperty('--b-me-text',s.meText);
  target.style.setProperty('--b-radius',s.radius+'px');
  target.style.setProperty('--m-font',FONTS[s.font]||FONTS.system);
  target.style.setProperty('--m-size',s.size+'px');
  target.style.setProperty('--m-weight',s.bold?'700':'400');
  target.style.setProperty('--m-style',s.italic?'italic':'normal');
  if(target===document.documentElement){
    // UI transparency + glass blur (customisable)
    const dl=typeof DiscordLook!=='undefined'&&DiscordLook.on();   // Discord look is always solid: ignore the glass sliders
    const op=dl?1:(s.uiOpacity??50)/100;
    target.style.setProperty('--ui-alpha',op);
    target.style.setProperty('--ui-blur',dl?'0px':(s.uiBlur??18)+'px');
    // background covers the ENTIRE app (all pages), not just the chat area
    paintBg($('#bgLayer'),$('#bgDimEl'),s);
  }
}

$('#settingsBtn').onclick=()=>openSettings(true);
