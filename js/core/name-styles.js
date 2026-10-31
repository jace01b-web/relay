/* ==========================================================================
 * js/core/name-styles.js
 * Decorative name styles (rainbow, gold, ...) and message-text display helpers
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// Which decorative preset (if any) should color this user's name right now: their
// live 24h flair takes priority, falling back to a permanent role of the same kind
// so the styling doesn't disappear the moment the 24h flair window ends.
const NAME_STYLE_PRESETS=['rainbow','gold','crown','neon','lucky','ice','fire'];
function nameStylePreset(id){
  if(!customNamesOn())return null;
  if(tagHidden(id,'flair'))return null;
  try{
    const live=DB.flairOf(id);
    if(live)return live;
    const roles=DB.rolesOf(id);
    for(const p of NAME_STYLE_PRESETS)if(roles[p]===true)return p;
  }catch(_){}
  return null;
}
// Wraps an already-escaped display name in the styling for the user's current
// decorative preset (if any and if the owner-level toggle is on). Falls back to
// the plain escaped name.
function styledNameHTML(id,escapedName){
  const p=nameStylePreset(id);
  return p?'<span class="flair-name flair-'+p+'">'+escapedName+'</span>':escapedName;
}
function checkMessageText_(text){return text}       // no longer pre-censors at send time — see displayMsgText()
// Personal, per-viewer filter: ON by default, editable in Settings > Filter, client-side
// only (each user's own preference for what THEY see; independent of the owner's
// global filter above, which still applies to everyone regardless of this setting).
function myFilterOn(){const u=(typeof DB!=='undefined')&&DB.currentUser&&DB.currentUser();return!u||u.settings.filterLocal!==false}
// Server-wide filter (owner-controlled) OR the viewer's own local toggle — either one
// being on censors what THEY see. Text is stored raw (see checkMessageText_) so turning
// either off actually reveals the original words, instead of unmasking pre-baked '*'s.
// Server-wide message filter removed — the "Filter cuss words & inappropriate messages"
// owner toggle used to force-censor everyone's view regardless of their personal
// preference. Now each person's own "Content filter (your view)" toggle is the only
// thing that controls what THEY see. filterNames (username filtering) is unrelated
// and still owner-controlled below.
function displayMsgText(text){return(myFilterOn()&&containsProfanity(text))?censorText(text):text}
