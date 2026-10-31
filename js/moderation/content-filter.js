/* ==========================================================================
 * js/moderation/content-filter.js
 * Profanity filter and username/display-name rules
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Profanity / inappropriate-content filter ----------
   Leetspeak-aware. Catches "f u c k", "f4ck", mid-word evasion like "Hel****lo".
   Toggled via modSettings/filterEnabled + modSettings/filterNames (owner-only
   write; ON by default until an owner explicitly turns it off). */
const FILTER_WORDS=['fuck','shit','bitch','cunt','asshole','bastard','dick','pussy','whore','slut','nigger','nigga','faggot','fag','retard','rape','molest'];
const LEET={a:'[a4@]',b:'[b8]',c:'[c(]',e:'[e3]',g:'[g9]',i:'[i1!|]',l:'[l1|]',o:'[o0]',s:'[s5$]',t:'[t7]',u:'[uv]',z:'[z2]'};
function _wordPat(word){
  const sep='[\\s._\\-*|+~^]*';
  const chars=word.split('');
  // Separator goes BETWEEN letters only (e.g. f-u-c-k), never after the last
  // one — otherwise the match swallows a trailing space/punctuation that
  // follows the word, and censorText() turns that into an extra '*' too.
  return chars.map((ch,i)=>{
    const cls=LEET[ch]||ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return cls+'+'+(i<chars.length-1?sep:'');
  }).join('');
}
const FILTER_RE=new RegExp(FILTER_WORDS.map(w=>'('+_wordPat(w)+')').join('|'),'gi');
function containsProfanity(str){if(!str)return false;FILTER_RE.lastIndex=0;return FILTER_RE.test(String(str).normalize('NFKC'))}
function censorText(str){if(!str)return str;return String(str).normalize('NFKC').replace(FILTER_RE,m=>'*'.repeat(m.length))}
let MODSET={filterEnabled:true,filterNames:true,customNames:true};
let MODSET_LOADED=false;   // retention/cleanup must never run off the built-in default before the real value has arrived
function filterMsgEnabled(){return MODSET.filterEnabled!==false}       // owner-controlled, server-side default (affects what's stored/shown to everyone)
function filterNamesOn(){return MODSET.filterNames!==false}
// Owner toggle: when on (default), a user holding a decorative role/flair gets a
// styled/colored name everywhere their name is shown; when off, everyone displays
// as a plain username regardless of what roles they hold.
function customNamesOn(){return MODSET.customNames!==false}
function displayUsername(name){return(filterNamesOn()&&containsProfanity(name))?censorText(name):name}
function usernameAllowed(name){return!filterNamesOn()||!containsProfanity(name)}
