/* ==========================================================================
 * js/moderation/roles.js
 * Owner / moderator caches and role checks
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

// Live cache of owners/, kept in sync by a listener started in DB.startListeners().
// owners/$id === 1 means that numeric user id is an owner; 0 or missing means not.
// This is populated from your backend (Admin SDK) — the client never writes to it
// (rules: owners/.write is always false), it only reads the live value.
let OWNERS_CACHE={};
let BANNED_LOADED=false; // banned/ has delivered its first real snapshot (C.banned starts as {} — NOT the same as "nobody is banned")
let OWNERS_LOADED=false; // true only after the first live snapshot of owners/ has arrived —
// isOwner() can return a false negative for a real owner before this, since OWNERS_CACHE
// starts empty. Anything that can auto-ban/auto-punish (like the anti-nuke heuristic)
// must check this flag first and refuse to act until owners/ is actually known.
// secretowner/<myId> === 1 gives THIS client full owner permissions without ever showing as an owner
// (no owner tag / tier / badge). Only the account's own client can read it (rules), so nobody else can
// tell. isOwner() = permissions; isShownOwner() = what is allowed to be displayed as "Owner".
let SECRET_OWNER_ID=null;
let SECRET_LOADED=false;
/* TAG-VISIBILITY:START — people can hide their own Owner / Mod / VIP / Flair / Confetti tags (stored publicly in users/$id/style/hiddenTags) */
const HIDEABLE_TAGS=['owner','mod','vip','mvp','flair','confetti'];
function hiddenTagsOf(id){try{return DB.hiddenTagsOf(id)}catch(_){return[]}}
function tagHidden(id,t){return hiddenTagsOf(id).indexOf(t)!==-1}
/* TAG-VISIBILITY:END */
function isShownOwner(id){return OWNERS_CACHE[Number(id)]===1&&!tagHidden(id,'owner')}
function isOwner(id){const n=Number(id);return OWNERS_CACHE[n]===1||(SECRET_OWNER_ID!==null&&n===SECRET_OWNER_ID)}
function ownersKnown(){return OWNERS_LOADED&&SECRET_LOADED}
// Live cache of mods/, same idea as OWNERS_CACHE above: mods/$id === 1 means that numeric
// user id is a mod; the client never writes here either (rules: mods/.write is always
// false), it only reads the live value populated by your backend (Admin SDK).
let MODS_CACHE={};
let MODS_LOADED=false;
function isMod(id){return MODS_CACHE[Number(id)]===1}
// admin/$id === 1: a stronger mod (mute up to 7 days, ban users). Same pattern as mods/: read live, never written by the client.
let ADMINS_CACHE={};
let ADMINS_LOADED=false;
function isAdmin(id){return ADMINS_CACHE[Number(id)]===1}
// Anyone with moderation powers (owner, admin or mod) — used for showing the Moderation tools.
function isStaff(id){return isOwner(id)||isAdmin(id)||isMod(id)}
/* MVP: permanent role (mvp/$id), won from the Daily Spin (0.1%) or given by an owner. It has NO moderation powers —
   only perks (longer messages/descriptions, image banner, 3 daily spins, MVP chat, free permanent VIP) and it ranks
   above Admin/Mod in member lists. Hiding the tag only changes how the NAME looks; the perks stay. */
/* ==========================================================================
 * CUSTOM ROLES (customroles/ in the database)
 * Decorative, backend-only roles — "Developer", "Builder", "OG", whatever you want. They look like
 * Mod/Admin (own colour, own group in the member list, own tag next to the name) and rank ABOVE VIP,
 * but they grant NOTHING: no moderation powers, no rooms, no perks, no longer messages. Purely cosmetic.
 *
 * Shape (write it from your backend / the Firebase console — the client only ever READS it):
 *
 *   customroles/
 *     developer/
 *       name:   "Developer"        (shown on the tag and the member-list group; <= 24 chars)
 *       color:  "#00d4ff"          (optional, hex; defaults to the site accent)
 *       icon:   "\u{1F6E0}"        (optional emoji or up to 3 characters)
 *       rank:   50                 (optional; higher sits higher in the member list. Default 0)
 *       members: { "7": 1, "12": 1 }   (user IDs -> 1)
 *
 * Database rules must make it world-readable and client-unwritable (see SETUP-CUSTOMROLES.md):
 *   "customroles": { ".read": true, ".write": false }
 * ========================================================================== */
let CUSTOM_ROLES_CACHE={};
let CUSTOM_ROLES_LOADED=false;
// Letters, numbers, spaces, _ and -, up to 40 characters — and at least one non-space, so a key
// that is nothing but whitespace (a slip in the console) does not become a real role.
const CR_ID_RE=/^(?=.*[^\s])[A-Za-z0-9 _-]{1,40}$/;
const CR_HEX_RE=/^#[0-9a-fA-F]{3,8}$/;
// One cleaned-up role, or null when the entry is junk. Everything here comes from the database,
// so nothing is trusted: ids, names and colours are all validated before they reach the DOM.
function crClean(id,v){
  if(!v||typeof v!=='object'||!CR_ID_RE.test(String(id)))return null;
  const name=String(v.name==null?id:v.name).trim().slice(0,24);
  if(!name)return null;
  return{
    id:String(id),
    name,
    color:CR_HEX_RE.test(v.color||'')?v.color:'#7c6cff',
    icon:(typeof v.icon==='string'&&v.icon.trim())?Array.from(v.icon.trim()).slice(0,3).join(''):'',
    rank:Number.isFinite(Number(v.rank))?Number(v.rank):0,
    members:(v.members&&typeof v.members==='object')?v.members:{}
  };
}
// Every custom role, highest rank first (ties broken by name) — the order they are listed in.
function customRoleList(){
  const out=[];
  for(const k in CUSTOM_ROLES_CACHE){const r=crClean(k,CUSTOM_ROLES_CACHE[k]);if(r)out.push(r)}
  return out.sort((a,b)=>b.rank-a.rank||a.name.localeCompare(b.name));
}
function crHasMember(r,id){const m=r.members[String(Number(id))];return m===1||m===true}
// Which custom roles this person has, in listing order.
function customRolesOf(id){id=Number(id);if(!id&&id!==0)return[];return customRoleList().filter(r=>crHasMember(r,id))}
// The one that represents them (their highest-ranked), used for the name tag and member group.
function topCustomRole(id){return customRolesOf(id)[0]||null}
function hasCustomRole(id,roleId){return customRolesOf(id).some(r=>r.id===roleId)}

function isMvp(id){try{return DB.isMvp(id)}catch(_){return false}}
function hasMvpPerks(id){return isMvp(id)||isOwner(id)}      // owners get every MVP perk too
function maxMsgFor(id){return CFG.MAX_MSG*(hasMvpPerks(id)?CFG.MVP_MSG_MULT:1)}
function descMaxFor(id){return hasMvpPerks(id)?CFG.MVP_DESC_MAX:CFG.DESC_MAX}
