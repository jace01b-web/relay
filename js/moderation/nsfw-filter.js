/* ==========================================================================
 * js/moderation/nsfw-filter.js
 * NSFW image detection (Nyckel)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- NSFW image detection (Nyckel) ----------
   Two layers: (1) before an image message is sent, the sender's client scans it and blocks
   it if flagged; (2) owner and mod clients scan images in incoming messages and delete
   flagged ones automatically (covers anyone using a modified client). Fails open: if the
   scan service errors or isn't configured, images go through unchanged. */
const NSFW={
  _tok:null,_tokExp:0,_tokP:null,_warned:false,seen:new Set(),
  on(){return !!(CFG.NSFW_ENABLED&&CFG.NYCKEL_FUNCTION_ID&&CFG.NYCKEL_CLIENT_ID&&CFG.NYCKEL_CLIENT_SECRET)},
  async token(){
    if(NSFW._tok&&Date.now()<NSFW._tokExp-60000)return NSFW._tok;
    if(NSFW._tokP)return NSFW._tokP;
    NSFW._tokP=(async()=>{
      const r=await fetch('https://www.nyckel.com/connect/token',{method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'client_credentials',client_id:CFG.NYCKEL_CLIENT_ID,client_secret:CFG.NYCKEL_CLIENT_SECRET})});
      if(!r.ok)throw new Error('token '+r.status);
      const j=await r.json();
      NSFW._tok=j.access_token;NSFW._tokExp=Date.now()+(Number(j.expires_in)||3600)*1000;
      return NSFW._tok;
    })();
    try{return await NSFW._tokP}finally{NSFW._tokP=null}
  },
  // -> {flagged,label,conf} or null if the scan couldn't run
  async scan(dataUrl){
    if(!NSFW.on())return null;
    try{
      const call=async()=>fetch('https://www.nyckel.com/v1/functions/'+CFG.NYCKEL_FUNCTION_ID+'/invoke',{method:'POST',
        headers:{'Authorization':'Bearer '+await NSFW.token(),'Content-Type':'application/json'},
        body:JSON.stringify({data:dataUrl})});
      let r=await call();
      if(r.status===401){NSFW._tok=null;r=await call()}
      if(!r.ok)throw new Error('invoke '+r.status);
      const j=await r.json();
      const label=String(j.labelName||''),conf=Number(j.confidence);
      const flagged=CFG.NSFW_LABEL_REGEX.test(label)&&!CFG.NSFW_SAFE_REGEX.test(label)&&(!(conf>=0)||conf>=CFG.NSFW_MIN_CONFIDENCE);
      console.debug('[nsfw]',label,conf,flagged);
      return{flagged,label,conf};
    }catch(e){
      if(!NSFW._warned){NSFW._warned=true;console.warn('NSFW scan unavailable (images allowed through):',e.message)}
      return null;
    }
  },
  // true if ANY of the images is flagged
  async anyFlagged(images){
    const rs=await Promise.all((images||[]).map(i=>NSFW.scan(i)));
    return rs.some(r=>r&&r.flagged);
  },
  // Owner/mod clients: delete recent messages that contain a flagged image.
  async sweep(key,arr){
    if(!NSFW.on()||!ME||!(isOwner(ME.id)||isAdmin(ME.id)||isMod(ME.id)))return;
    const cutoff=Date.now()+SKEW-10*60000;
    for(const m of arr){
      if(!m.images||!m.images.length||m.at<cutoff||NSFW.seen.has(key+'|'+m.id))continue;
      if(isOwner(m.senderId))continue;   // mods can't delete owners' messages; owners are trusted
      NSFW.seen.add(key+'|'+m.id);
      NSFW.anyFlagged(m.images).then(bad=>{
        if(!bad)return;
        DB.deleteMessage(key,m.id).then(()=>toast('Removed a flagged image and muted the sender for 1 hour.')).catch(()=>{});
        // every detection = 1 hour mute (mods can't mute mods/owners; that just errors and is ignored)
        DB.muteUser(m.senderId,3600000).catch(()=>{});
      });
    }
  }
};
