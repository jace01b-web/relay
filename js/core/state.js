/* ==========================================================================
 * js/core/state.js
 * Shared app state (ME, view), clipboard helper and toasts
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- 3. Auth helpers ---------- */
let ME=null;
let view={page:'loadingPage',mode:null,section:null,roomKey:null,pending:[],pendingFiles:[],mentionSel:0,replyingTo:null,editingId:null};

/* ---------- Toasts ---------- */
// Copies text to the clipboard. Falls back to a hidden textarea when the async Clipboard API is
// unavailable (launcher / about:blank windows, older browsers, non-secure contexts).
async function copyText(t){
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(t);return true}}catch(_){}
  try{
    const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,t.length);
    const ok=document.execCommand('copy');ta.remove();return ok;
  }catch(_){return false}
}
function toast(msg,type=''){
  const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;
  $('#toasts').appendChild(t);setTimeout(()=>t.remove(),4000);
}
