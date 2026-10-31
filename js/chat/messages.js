/* ==========================================================================
 * js/chat/messages.js
 * Message list rendering, reactions, reply jump
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* Render messages */
let lastCount={};
// Tracks what's actually in the DOM right now, so a new message can be appended
// on its own instead of tearing down and rebuilding every bubble already shown
// (which used to make the whole conversation "flash"/re-animate on every send).
let renderedKey=null,renderedIds=[];
// id -> {el, sig}. "sig" is what msgEl() actually rendered for that sender at the
// time (their name + deleted-state). A sender can resolve AFTER the bubble was
// first painted — e.g. the bulk 'users' listener hasn't finished its first sync
// yet, or a one-off fetchUserIfMissing() is still in flight — which used to leave
// messages permanently stuck showing "Deleted User" once we stopped rebuilding
// the whole list on every update. senderSig()/patchResolvedSenders() below
// re-check every rendered bubble whenever anything changes and swap in a fresh
// element only for the ones whose sender info actually changed.
let renderedNodes=new Map();
// What a reply quote should show: the replied-to message's CURRENT text (so edits show up), "gone" when that
// message was deleted, or the preview saved with the reply when the original is older than the loaded window.
function replyTargetInfo(m){
  const rt=m&&m.replyTo;if(!rt||!rt.id)return null;
  let list=[];try{list=DB.messages(view.roomKey)||[]}catch(_){}
  const src=list.find(x=>x.id===rt.id);
  if(src){
    const t=src.text?displayMsgText(src.text):(typeof replyPreviewText==='function'?replyPreviewText(src):'');
    return{gone:false,text:String(t||'').replace(/\s+/g,' ').trim().slice(0,200)};
  }
  if(!list.length)return{gone:false,text:rt.preview||''};          // nothing loaded yet: can't tell
  let more=true;try{more=DB.canLoadOlder(view.roomKey)}catch(_){}
  // everything is loaded, or the target would sit inside the loaded window -> it really was deleted
  if(!more||rt.id>=list[0].id)return{gone:true,text:''};
  return{gone:false,text:String(rt.preview||'').replace(/\s+/g,' ').trim().slice(0,200)};   // older than what's loaded
}
function senderSig(m){
  const sender=DB.getUser(m.senderId);
  const name=(sender&&!sender.deleted)?displayUsername(sender.username):'Deleted User';
  const avatar=(sender&&sender.settings&&sender.settings.avatar)||'';
  // Include whether we've resolved the sender at all (not just name/avatar) so a
  // message rendered before a sender's record loaded gets rebuilt — with a clickable
  // profile avatar — once that record arrives, even if name/avatar end up unchanged.
  const resolved=sender?'1':'0';
  // Also fold in the message's own editable content, so an edit (text/editedAt
  // change on an id we've already rendered) gets picked up by the same
  // rebuild-in-place path as a sender resolving, instead of being silently
  // skipped by the append-only fast path in renderMessages.
  // Reactions are stored outside the message itself (their own DB node), so also
  // fold their current shape in here — otherwise a reaction toggle wouldn't trigger
  // a rebuild of this row under the append-only fast path.
  const rx=DB.reactionsFor(view.roomKey,m.id).map(r=>r.emoji+':'+r.ids.join(',')).sort().join('|');
  const ri=replyTargetInfo(m);
  return resolved+'|'+name+'|'+avatar+'|'+(m.text||'')+'|'+(m.editedAt||0)+'|'+rx+'|'+(ri?(ri.gone?'\u0001gone':ri.text):'');
}
function appendMsgRow(box,m,lastDay,live){
  const day=new Date(m.at).toDateString();
  if(day!==lastDay){const d=document.createElement('div');d.className='date-sep';d.textContent=day;box.appendChild(d)}
  const el=msgEl(m);
  // `live` marks a message that's genuinely just arriving (sent or received
  // in real time) rather than one being painted as part of loading history —
  // only those get the extra "just landed" glow, cleaned up once it's done
  // so it never risks replaying later (e.g. if this node is ever reused).
  if(live&&!(typeof DiscordLook!=='undefined'&&DiscordLook.on())){
    el.classList.add('msg-live');
    el.addEventListener('animationend',()=>el.classList.remove('msg-live'),{once:true});
  }
  // Discord look: consecutive messages from one person within 7 minutes collapse under a single name/avatar
  el._sid=m.senderId;el._at=m.at;
  if(typeof DiscordLook!=='undefined'&&DiscordLook.on()){
    const prev=box.lastElementChild;
    if(prev&&prev.classList.contains('msg')&&prev._sid===m.senderId&&m.at-prev._at<420000&&!(m.replyTo&&m.replyTo.id))el.classList.add('dl-cont');
  }
  box.appendChild(el);
  fitAvatarToRow(el);
  renderedNodes.set(m.id,{el,sig:senderSig(m)});
  return day;
}
// No-ops kept so every existing call site (initial render, image load,
// settings preview, sender-resolve rebuild) still has something to call.
// Avatars now stay a fixed size and bottom-align to the bubble purely via
// CSS (.msg-row{align-items:flex-end}), so no per-message JS measurement
// or resizing is needed any more — that measurement is what used to drift
// out of sync (window resize, late edits, etc.) and leave the avatar
// looking detached/floating from the bubble.
function refitAllAvatars(){}
function fitAvatarToRow(el){}
function patchResolvedSenders(list){
  list.forEach(m=>{
    const rec=renderedNodes.get(m.id);
    if(!rec)return;
    const sig=senderSig(m);
    if(sig!==rec.sig){
      const fresh=msgEl(m);
      fresh._sid=rec.el._sid;fresh._at=rec.el._at;if(rec.el.classList.contains('dl-cont'))fresh.classList.add('dl-cont');
      rec.el.replaceWith(fresh);
      fitAvatarToRow(fresh);
      renderedNodes.set(m.id,{el:fresh,sig});
    }
  });
}
// Animates the message list down to its newest content instead of snapping
// there — used specifically for "a new message just arrived while we're
// already at (or sticking to) the bottom", so the already-visible bubbles
// glide up smoothly together with the new one fading in, rather than the
// view jumping first and the message popping in after. Respects a reduced-
// motion preference by falling back to an instant jump.
const _reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function smoothScrollToBottom(box){
  if(_reduceMotion){box.scrollTop=box.scrollHeight;return}
  try{box.scrollTo({top:box.scrollHeight,behavior:'smooth'})}
  catch(_){box.scrollTop=box.scrollHeight}
}
/* Keep a freshly-opened chat pinned to its newest message.
   A single scrollTop=scrollHeight is not enough: images decode after layout and grow the
   list, and the first snapshot for a room can be replaced by the full one a moment later.
   So we re-pin for a short window, and stop the instant the user scrolls up themselves. */
let _pinToken=0;
function pinToBottom(box){
  const token=++_pinToken;
  let userMoved=false;
  const stop=()=>{userMoved=true};
  const jump=()=>{if(token===_pinToken&&!userMoved)box.scrollTop=box.scrollHeight};
  jump();
  requestAnimationFrame(()=>{jump();requestAnimationFrame(jump)});
  box.addEventListener('wheel',stop,{once:true,passive:true});
  box.addEventListener('touchmove',stop,{once:true,passive:true});
  box.addEventListener('keydown',stop,{once:true});
  // images that finish loading after the first paint
  box.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',jump,{once:true})});
  // and a couple of late passes for layout that settles slowly (fonts, decode, big lists)
  [60,180,400,800].forEach(ms=>setTimeout(jump,ms));
}
function renderMessages(key){
  const box=$('#messages');
  const roomChanged=key!==renderedKey;
  const list=DB.messages(key);
  const ids=list.map(m=>m.id);
  const autoScroll=ME.settings.autoScrollBottom!==false;
  const atBottom=roomChanged?true:(box.scrollHeight-box.scrollTop-box.clientHeight<80);
  let liveRows=[];   // rows appended live this pass (used for ping toasts)

  // How much of what's already on screen can we keep untouched? Two shapes are
  // common and both avoid tearing the list down: a plain append (nothing lost),
  // and the "sliding window" shape a busy room hits once its history passes the
  // server's 300-message cap — the oldest visible message ages out of the query
  // at the very same moment a new one arrives. That used to fail the old
  // "every id still lines up" check and fall through to a full rebuild on
  // basically every message in an active room, which is what made the whole
  // conversation flash/re-animate for an instant each time. `drop` is how many
  // of the previously-rendered ids fell off the front this update (0 for a
  // plain append); -1 means neither shape fits (room switch, an edit that
  // reshuffled the list, a deletion in the middle) and we do fall back to a
  // full rebuild for those.
  let drop=-1;
  if(!roomChanged&&renderedIds.length&&ids.length){
    const at=renderedIds.indexOf(ids[0]);
    if(at!==-1&&renderedIds.slice(at).every((id,i)=>ids[i]===id))drop=at;
  }

  if(roomChanged||drop===-1){
    // Full rebuild: entering/switching a room, or the list changed in a way
    // that isn't a simple append or window-slide (e.g. a message was unsent).
    // If we're staying in the same room and the reader has scrolled up (e.g. a message
    // was unsent, or the full history replaced the quick preview), keep their place
    // instead of yanking them down.
    const keepPlace=!roomChanged&&!atBottom;
    const prevTop=box.scrollTop,prevH=box.scrollHeight;
    box.innerHTML='';renderedNodes=new Map();
    if(!list.length)box.innerHTML='<div class="sys">No messages yet. Say hi! 👋</div>';
    let lastDay='';
    list.forEach(m=>{lastDay=appendMsgRow(box,m,lastDay)});
    if(keepPlace){
      // history can grow above the viewport (preview -> full list), so offset by the growth
      box.scrollTop=prevTop+Math.max(0,box.scrollHeight-prevH);
    }else pinToBottom(box);
  }else{
    // Trim any aged-out messages off the top first — without touching anything
    // still on screen, and without yanking a reader who's scrolled up into
    // history around, since removing nodes above the viewport shortens the
    // page above them.
    if(drop>0){
      const prevH=box.scrollHeight;
      const keepEl=renderedNodes.get(renderedIds[drop])?.el;
      if(keepEl)while(box.firstChild&&box.firstChild!==keepEl)box.removeChild(box.firstChild);
      renderedIds.slice(0,drop).forEach(id=>renderedNodes.delete(id));
      if(!atBottom){
        const delta=prevH-box.scrollHeight;
        if(delta>0)box.scrollTop=Math.max(0,box.scrollTop-delta);
      }
    }
    // Append-only: just add the new rows, leaving existing bubbles untouched...
    const keptCount=renderedIds.length-drop;
    const newOnes=list.slice(keptCount);
    liveRows=newOnes;
    if(newOnes.length){
      let lastDay=keptCount>0?new Date(list[keptCount-1].at).toDateString():'';
      newOnes.forEach(m=>{lastDay=appendMsgRow(box,m,lastDay,true)});
      if(autoScroll||atBottom){
        // Smooth-glide the view down to the new message instead of snapping —
        // the previously-visible bubbles glide up out of the way together
        // rather than jumping, which is what makes the arrival read as one
        // continuous motion instead of two separate, jarring changes.
        if(typeof DiscordLook!=='undefined'&&DiscordLook.on())box.scrollTop=box.scrollHeight;else smoothScrollToBottom(box);
        box.querySelectorAll('.msg:nth-last-child(-n+3) img').forEach(img=>{
          if(!img.complete)img.addEventListener('load',()=>{box.scrollTop=box.scrollHeight},{once:true});
        });
      }
    }
    // ...but still fix up any earlier bubble whose sender has since resolved
    // (or, rarely, been marked deleted), without touching the ones that are
    // already showing the right thing.
    patchResolvedSenders(list);
  }
  renderedKey=key;renderedIds=ids;

  // ping detection: every ping on screen counts as seen (marked read); only rows that just arrived
  // live (the append-only path above) and that we haven't shown before get a toast + chime.
  const liveIds=new Set(liveRows.map(m=>m.id));
  list.forEach(m=>{
    if(m.senderId===ME.id)return;
    const pinged=m.pings.includes(ME.id)||(m.pings.includes('everyone')&&ME.settings.pings.everyone);
    if(!pinged||pingSeen(m.id))return;
    markPingSeen(m);
    if(!liveIds.has(m.id)||m.at<=NOTIFY_SINCE)return;   // history / already-there: seen silently, no repeat toast
    pingToast(m,key,DB.getUser(m.senderId));
    if(ME.settings.pings.sound)beep();
  });
  lastCount[key]=list.length;
}

// Builds the row of Discord-style reaction pills under a message's bubble.
// Each pill shows the emoji + count, is highlighted if I've reacted with it,
// and its title lists who reacted (resolved from the live user cache).
function reactionRowHTML(msgId){
  const list=DB.reactionsFor(view.roomKey,msgId);
  if(!list.length)return'';
  const pills=list.map(r=>{
    const names=r.ids.map(id=>{
      const u=DB.getUser(id);
      return(u&&!u.deleted)?displayUsername(u.username):'Deleted User';
    });
    const who=names.length<=6?names.join(', '):names.slice(0,6).join(', ')+' and '+(names.length-6)+' more';
    return`<button class="reaction-pill${r.mine?' mine':''}" data-emoji="${esc(r.emoji)}" title="${esc(who)}">
      <span class="rp-emoji">${esc(r.emoji)}</span><span class="rp-count">${r.ids.length}</span>
    </button>`;
  }).join('');
  return`<div class="reactions-row">${pills}<button class="reaction-pill reaction-add" data-add-reaction title="Add reaction">+</button></div>`;
}
// Wires clicks on the reaction pills (toggle) and the trailing "+" (opens the picker).
function wireReactions(el,m){
  el.querySelectorAll('.reaction-pill[data-emoji]').forEach(pill=>{
    pill.onclick=(ev)=>{
      ev.stopPropagation();
      DB.toggleReaction(view.roomKey,m.id,pill.dataset.emoji).catch(e=>toast(e.message,'bad'));
    };
  });
  const addBtn=el.querySelector('[data-add-reaction]');
  if(addBtn)addBtn.onclick=(ev)=>{
    ev.stopPropagation();
    openEmojiPicker(addBtn,emoji=>{
      DB.toggleReaction(view.roomKey,m.id,emoji).catch(e=>toast(e.message,'bad'));
    });
  };
}
function msgEl(m){
  const mine=m.senderId===ME.id;
  const sender=DB.getUser(m.senderId);           // username resolved via ID at render time
  const name=(sender&&!sender.deleted)?displayUsername(sender.username):'Deleted User';
  const pinged=m.pings.includes(ME.id)||m.pings.includes('everyone');
  const el=document.createElement('div');el.className='msg'+(mine?' me':'')+(pinged?' ping-row':'')+(m.pings.includes('everyone')?' ping-all':'');el.dataset.msgId=m.id;
  const time=new Date(m.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const av=avatarHtml(sender,name,'width:46px;height:46px;font-size:17px');
  const avClickable=(sender&&!sender.deleted)?`<span data-open-profile="${m.senderId}" style="cursor:pointer">${av}</span>`:av;
  // Everyone's message bubble reflects how THEY styled their own messages (their meBubble/meText),
  // not a color the viewer picks for "others" — so no per-viewer "others' color" setting exists anymore.
  let bStyle='';
  if(!mine){
    const ss=sender&&sender.settings;
    const bg=safeColor(ss&&ss.meBubble,'#7c6cff'),fg=safeColor(ss&&ss.meText,'#ffffff');
    bStyle=` style="background:${hexToRgba(bg,.5)};color:${fg}"`;
  }
  // You can delete your own messages. Owners can delete anyone's; mods can delete anyone's
  // except an owner's (the database rules enforce the same thing).
  const canDelete=mine||isOwner(ME.id)||(isAdmin(ME.id)&&!isOwner(m.senderId))||(isMod(ME.id)&&!isOwner(m.senderId)&&!isAdmin(m.senderId));
  const canEdit=mine&&!!m.text;
  // Discord-style hover bar: a reply arrow starts a reply, edit (own
  // messages only) is a pencil. Deleting stays inline in the meta line
  // further below, same as before.
  const _dl=typeof DiscordLook!=='undefined'&&DiscordLook.on();
  const _ic=d=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // Discord uses solid (filled) glyphs in its hover toolbar
  const _fi=(d,eo)=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path${eo?' fill-rule="evenodd" clip-rule="evenodd"':''} d="${d}"/></svg>`;
  const IC={
    reply:_fi('M10 9V5l-8 7 8 7v-4c5 0 8.5 1.5 11 5-1-6-4.5-11-11-11z'),
    react:_fi('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM7 14h10a5 5 0 0 1-10 0z',1),
    copy:_fi('M16 1H6a3 3 0 0 0-3 3v12h2V4a1 1 0 0 1 1-1h10V1zm3 4H10a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3z'),
    edit:_fi('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'),
    del:_fi('M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z')
  };

  const replyBtn=`<button data-reply-btn title="Reply">${_dl?IC.reply:'↪'}</button>`;
  const reactBtn=`<button data-react-btn title="Add reaction">${_dl?IC.react:'😊'}</button>`;
  const copyBtn=m.text?`<button data-copy-btn title="Copy message">${_dl?IC.copy:'📋'}</button>`:'';
  const editBtn=canEdit?`<button data-edit-btn title="Edit message">${_dl?IC.edit:'✏️'}</button>`:'';
  // Delete button sits in the hover bar: on your own messages, and on everyone's for
  // owners and mods (mods can't delete owners' messages).
  const delBtn=canDelete?`<button data-more-btn title="Delete message" class="hb-danger">${_dl?IC.del:'🗑️'}</button>`:'';
  const editedTag=(m.editedAt&&m.text)?`<span class="edited-tag">(edited)</span>`:'';
  let replyRefHTML='';
  if(m.replyTo&&m.replyTo.id){
    const ri=replyTargetInfo(m);
    if(ri&&ri.gone){
      replyRefHTML=`<div class="reply-ref gone">
      <svg class="rr-elbow" viewBox="0 0 20 12"><path d="M2 0 v4 a6 6 0 0 0 6 6 h10"/></svg>
      <span class="rr-text">Deleted Message</span>
    </div>`;
    }else{
      const rs=DB.getUser(m.replyTo.senderId);
      const rname=(rs&&!rs.deleted)?displayUsername(rs.username):'Deleted User';
      const rtext=ri&&ri.text?esc(ri.text):'';
      const rav=avatarHtml(rs,rname,'width:15px;height:15px;font-size:8px');
      replyRefHTML=`<div class="reply-ref" data-reply-jump="${m.replyTo.id}">
      <svg class="rr-elbow" viewBox="0 0 20 12"><path d="M2 0 v4 a6 6 0 0 0 6 6 h10"/></svg>
      <span class="rr-avatar">${rav}</span><span class="rr-name">${esc(rname)}</span><span class="rr-text">${rtext}</span>
    </div>`;
    }
  }
  const myAv=mine?`<span data-open-profile="${m.senderId}" style="cursor:pointer">${av}</span>`:'';
  // Everyone's name is shown, including your own. Others: "Name · time" (left side). Yours: "time · Name"
  // so the name sits next to your avatar on the right, and the hover/edit controls don't move.
  const nameSpan=(sender&&!sender.deleted)
    ?`<span data-open-profile="${m.senderId}" style="cursor:pointer">${fullNameHTML(m.senderId,esc(name))}</span>`
    :esc(name);
  const nameHTML=mine?'':nameSpan+'<span class="nm-sep">·</span>';
  const nameAfter=mine?'<span class="nm-sep">·</span>'+nameSpan:'';
  const reactionsHTML=reactionRowHTML(m.id);
  el.innerHTML=`${replyRefHTML}<div class="msg-row">${mine?myAv:avClickable}<div class="msg-body"><div class="meta">${nameHTML}${time}${editedTag}${isShownOwner(m.senderId)?' <span class="tag owner">#'+m.senderId+'</span>':''}${DB.isMuted(m.senderId)?' <span class="tag" style="background:#555;color:#fff">muted</span>':''}${nameAfter}</div>
    <div class="bubble${pinged?' pinged':''}${(!m.text&&((m.images&&m.images.length)||(m.files&&m.files.length)))?' img-only':''}${isEmojiOnly(m.text)?' jumbo-emoji':''}"${bStyle}><div class="msg-hover-bar">${_dl?`${copyBtn}${replyBtn}${reactBtn}${editBtn}${delBtn}`:`${copyBtn}${editBtn}${delBtn}${reactBtn}${replyBtn}`}</div>${fmtText(displayMsgText(m.text))}${imagesHTML(m.images)}${filesHTML(m.files)}</div>${reactionsHTML}</div></div>`;
  el.querySelectorAll('.imgs img').forEach((img,i)=>img.onclick=()=>openLightbox(m.images,i));
  wireReactions(el,m);
  const reactBtnEl=el.querySelector('[data-react-btn]');
  if(reactBtnEl)reactBtnEl.onclick=(ev)=>{
    ev.stopPropagation();
    openEmojiPicker(reactBtnEl,emoji=>{
      DB.toggleReaction(view.roomKey,m.id,emoji).catch(e=>toast(e.message,'bad'));
    });
  };
  const moreBtn=el.querySelector('[data-more-btn]');
  if(moreBtn)moreBtn.onclick=(ev)=>{
    ev.stopPropagation();
    modalDeleteMessageConfirm(view.roomKey,m);
  };
  el.querySelectorAll('[data-open-profile]').forEach(pEl=>{pEl.onclick=()=>openUserProfile(Number(pEl.dataset.openProfile))});
  const copyBtnEl=el.querySelector('[data-copy-btn]');
  if(copyBtnEl)copyBtnEl.onclick=(ev)=>{ev.stopPropagation();copyText(displayMsgText(m.text)).then(ok=>toast(ok?'Message copied':'Couldn\'t copy — select the text and copy manually',ok?'':'bad'))};
  const replyBtnEl=el.querySelector('[data-reply-btn]');
  if(replyBtnEl)replyBtnEl.onclick=()=>startReply(m);
  const editBtnEl=el.querySelector('[data-edit-btn]');
  if(editBtnEl)editBtnEl.onclick=()=>startEdit(m);
  const jumpEl=el.querySelector('[data-reply-jump]');
  if(jumpEl)jumpEl.onclick=()=>jumpToMessage(jumpEl.dataset.replyJump);
  return el;
}
// Scrolls to and briefly highlights a message already rendered in the current view,
// so tapping a reply quote takes you to the message it replied to.
function jumpToMessage(id){
  const el=$('#messages').querySelector(`[data-msg-id="${id}"]`);
  if(!el){toast('That message isn\'t loaded here.');return}
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.classList.add('pinned-flash');
  setTimeout(()=>el.classList.remove('pinned-flash'),1200);
}
