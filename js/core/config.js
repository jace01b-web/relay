/* ==========================================================================
 * js/core/config.js
 * Global config constants (CFG) and validation limits
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- 1. Config + validation ---------- */
const CFG={
  USERNAME_RE:/^[0-9a-zA-Z._-]{1,20}$/,
  NAME_CHANGE_MS:7*24*60*60*1000,
  MAX_IMAGES:5,
  MAX_MSG:2000,
  MAX_IMG_BYTES:8*1024*1024,
  // Cap on the final base64 data-URL string written to the database, per image.
  // Matches the actual server rule: messages/$key/$msg/images/$i must be a string
  // beginning with 'data:image/jpeg;base64,' and under 900,000 characters. We stay
  // well under that (not right at the edge) so: (1) small encoding differences
  // between browsers never tip a "just barely compressed enough" image over the
  // server's real limit, and (2) smaller payloads upload faster, which matters
  // because the rules also require the message's timestamp to be within 1.5s of
  // the server's clock AT THE MOMENT THE WRITE LANDS — a slow upload of a huge
  // image can miss that window even though the write itself would've been valid.
  MAX_IMG_DATAURL_CHARS:700000,
  // --- File uploads (GIF / video / audio / text / other) ---
  // Default: Firebase Storage (needs the Blaze plan). FREE alternative with no card: Cloudinary.
  // Fill BOTH of these in (see SETUP-FILES.md, "No Blaze plan?") and uploads go to Cloudinary instead.
  CLOUDINARY_CLOUD:'itsukischathub',     // your Cloudinary "cloud name", e.g. 'dab12xyz'
  CLOUDINARY_PRESET:'itsukischathub',    // name of an UNSIGNED upload preset, e.g. 'ich_chat'
  MIN_PW:6,
  GLOBAL_ROOM:'global',
  ANNOUNCEMENTS_ROOM:'announcements',
  SHITPOST_ROOM:'shitpost',    // staff-only posting (mods/admins/owners), everyone can read; own unread badge like announcements
  VIP_ROOM:'vip',
  MVP_ROOM:'mvp',              // MVP-only chat (MVP role = permanent, no moderation powers, ranks above staff in lists)
  MVP_SPINS_PER_DAY:3,         // MVPs get this many Daily Spins per 24h window (everyone else gets 1)
  DESC_MAX:150,                // profile description length
  MVP_DESC_MAX:300,            // ...for MVPs
  MVP_MSG_MULT:2,              // MVPs can send messages this many times longer than MAX_MSG
  MVP_BANNER_MAX_CHARS:150000, // size cap of an MVP image banner (base64 data URL)
  NUKE_MSGS:3,          // this many messages...
  NUKE_WINDOW_MS:1000,  // ...within this window triggers anti-nuke
  OWNER_IDS:[], // no longer used for permission checks — kept empty; owner status now comes live from owners/$id===1 in the database (see C.owners / isOwner()). Populate owners/$id there from your own backend, not here.
  SEND_COOLDOWN_MS:1500,
  // --- Terms of Service / IP ban / VPN gate (js/moderation/tos-gate.js + the /api functions) ---
  TOS_VERSION:3,                  // bumped 2->3 for the new logging: every older TOS record is void and everyone re-accepts.
                                  // Keep this equal to TOS_VERSION in api/_lib.js (and to the TOS_VERSION env var, if you set one).
  TOS_API:'https://itsukis-chat-hub.vercel.app',   // where the /api functions are deployed. The Discord webhook now lives ONLY in the server env.
  ATTEST_EVERY_MS:4*60*1000,      // how often the browser asks the server to re-clear this login (server grants 8 min at a time)
  IP_BAN_FULL_LOCK:false,         // false = an IP-banned network can't CHAT. true = it is locked out of the whole menu like a banned account
  // --- NSFW image detection (Nyckel) ---
  NSFW_ENABLED:true,
  NYCKEL_FUNCTION_ID:'wyv22067tq24vkn5',
  NYCKEL_CLIENT_ID:'p3752er2dbapnm9gxuqzk57o5w0jpbj3',
  NYCKEL_CLIENT_SECRET:'tkgbj7q6exahzgpi93kzv1jkwiz6d7c1s7w35ywp3jlmupoo6iamqj8r1we08ks6',   // <-- paste your Nyckel client secret here (see note: it is visible to anyone who views the page source)
  NSFW_MIN_CONFIDENCE:0.6,   // flag when the NSFW label's confidence is at least this
  NSFW_LABEL_REGEX:/nsfw|explicit|porn|adult|unsafe|sexual|nude/i,   // labels that count as NSFW
  NSFW_SAFE_REGEX:/^(sfw|safe|not|non|no\b|clean)/i                 // labels that are explicitly safe (wins over the regex above)
};
