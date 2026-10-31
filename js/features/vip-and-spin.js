/* ==========================================================================
 * js/features/vip-and-spin.js
 * VIP lounge (roles, flairs, badges) and Daily Spin
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- VIP Lounge + Daily Spin ---------- */
const VIP_FLAIRS={
  gold:{e:'🥇',n:'Golden Flair'},rainbow:{e:'🌈',n:'Rainbow Flair'},crown:{e:'👑',n:'Crown Flair'},
  neon:{e:'💡',n:'Neon Flair'},lucky:{e:'🍀',n:'Lucky Flair'},ice:{e:'❄️',n:'Ice Flair'},fire:{e:'🔥',n:'Fire Flair'}
};
// Order matters: this is the clockwise order of the wheel slices, starting at the top.
const SPIN_PRIZES=[
  {id:'none',    name:'No luck',        e:'😅',pct:15.9,color:'#4a4d63',msg:'No prize this time. Your next free spin unlocks in 24 hours.'},
  {id:'confetti',name:'Confetti Blast', e:'🎉',pct:14,color:'#ff5fc0',role:'confetti',msg:'Confetti Blast! The role is now saved to your profile.'},
  {id:'gold',    name:'Golden Flair',   e:'🥇',pct:9, color:'#e6a91f',flair:'gold',role:'gold',msg:'Golden Flair now shows next to your name for 24 hours.'},
  {id:'rainbow', name:'Rainbow Flair',  e:'🌈',pct:8, color:'#5aa9ff',flair:'rainbow',role:'rainbow',msg:'Rainbow Flair now shows next to your name for 24 hours.'},
  {id:'crown',   name:'Crown Flair',    e:'👑',pct:8, color:'#8b78ff',flair:'crown',role:'crown',msg:'Crown Flair now shows next to your name for 24 hours.'},
  {id:'neon',    name:'Neon Flair',     e:'💡',pct:8, color:'#27d8f0',flair:'neon',role:'neon',msg:'Neon Flair now shows next to your name for 24 hours.'},
  {id:'lucky',   name:'Lucky Flair',    e:'🍀',pct:8, color:'#22a95e',flair:'lucky',role:'lucky',msg:'Lucky Flair now shows next to your name for 24 hours.'},
  {id:'ice',     name:'Ice Flair',      e:'❄️',pct:8, color:'#3f86f5',flair:'ice',role:'ice',msg:'Ice Flair now shows next to your name for 24 hours.'},
  {id:'fire',    name:'Fire Flair',     e:'🔥',pct:8, color:'#ff4a0f',flair:'fire',role:'fire',msg:'Fire Flair now shows next to your name for 24 hours.'},
  {id:'close',   name:'So close!',      e:'😬',pct:4, color:'#3a3c4d',msg:'So close! Try again tomorrow.'},
  {id:'vip1',    name:'VIP — 1 Day',    e:'🌞',pct:7, color:'#ffbf4d',role:'vip1',msg:'VIP for 24 hours. The VIP Lounge is open to you.'},
  {id:'vipperm', name:'VIP — Forever',  e:'💎',pct:2, color:'#ffe11a',role:'vipperm',msg:'VIP forever. The VIP Lounge is yours for good.'},
  {id:'mvp',     name:'MVP — Forever',  e:'🏆',pct:0.1,color:'#ff2fa0',role:'mvp',msg:'MVP! Permanent. Image banners, 300-char bio, 2x message length, 3 spins a day, MVP Chat and free VIP are yours.'}
];
const ROLE_LABELS={
  confetti:'🎉 Confetti Blast',gold:'🥇 Golden Flair',rainbow:'🌈 Rainbow Flair',crown:'👑 Crown Flair',neon:'💡 Neon Flair',
  lucky:'🍀 Lucky Flair',ice:'❄️ Ice Flair',fire:'🔥 Fire Flair',vip1:'🌞 VIP — 1 Day',vipperm:'💎 VIP — Forever',mvp:'🏆 MVP — Forever'
};
function vipBadgeHTML(id){
  let h='';
  try{
    const v=DB.vipInfo(id,true);
    if(v&&v.kind==='mvp')h+='<span class="vip-badge mvp-badge" title="MVP">🏆</span>';
    else if(v&&v.kind!=='owner')h+='<span class="vip-badge" title="VIP">💎</span>';
    // Live 24h flair takes priority; otherwise fall back to a permanent role of the
    // same preset so the little name-badge doesn't vanish once the 24h window ends.
    const f=DB.flairOf(id);
    const roles=DB.rolesOf(id);
    const perm=f||NAME_STYLE_PRESETS.find(p=>roles[p]===true);
    const hf=tagHidden(id,'flair'),hc=tagHidden(id,'confetti');
    if(!hf&&perm&&VIP_FLAIRS[perm])h+='<span class="flair-badge flair-'+perm+'" title="'+VIP_FLAIRS[perm].n+(roles[perm]&&!f?' (permanent)':'')+'">'+VIP_FLAIRS[perm].e+'</span>';
    // Roles with no flair/name-color of their own (currently just Confetti Blast)
    // still deserve a permanent little badge once earned.
    if(!hc&&roles.confetti===true)h+='<span class="flair-badge" title="Confetti Blast (permanent)">🎉</span>';
  }catch(_){}
  return h?' '+h:'';
}

// Whole-name rendering: the VIP tier (permanent => Legend, live 24h => Star) styles the
// title AND the username together. A flair (if any) still colors the username itself.
/* Tier order, highest first: Owner, MVP, then any CUSTOM ROLE (decorative, see js/moderation/roles.js),
   then permanent VIP (Legend) and 24h VIP (Star). A custom role outranks VIP on the name for the same
   reason it is listed above VIP in the member list \u2014 it says who someone is, not what they bought. */
function vipTierOf(id){
  try{
    const v=DB.vipInfo(id,true);
    if(v&&v.kind==='owner')return{cls:'tier-owner',ic:'\u{1F531}',label:'Owner',tip:'Server owner'};
    if(v&&v.kind==='mvp')return{cls:'tier-mvp',ic:'\u{1F3C6}',label:'MVP',tip:'MVP \u2014 permanent'};
    const cr=topCustomRole(id);
    if(cr)return{cls:'tier-custom',ic:cr.icon||'\u2756',label:cr.name,tip:cr.name,color:cr.color};
    if(v&&v.kind==='perm')return{cls:'tier-legend',ic:'\u{1F451}',label:'Legend',tip:'Permanent VIP'};
    if(v&&v.kind==='day')return{cls:'tier-star',ic:'\u{1F31E}',label:'Star',tip:'24-hour VIP'};
  }catch(_){}
  return null;
}
function vipTitleHTML(id){return ''} // kept for compatibility; titles are now built in fullNameHTML
function fullNameHTML(id,escapedName){
  const t=vipTierOf(id);
  if(!t)return styledNameHTML(id,escapedName);
  const p=nameStylePreset(id);
  const user=p?'<span class="nm-user flair-name flair-'+p+'">'+escapedName+'</span>':'<span class="nm-user">'+escapedName+'</span>';
  const style=t.color?' style="--rc:'+esc(t.color)+'"':'';
  return '<span class="nm-wrap '+t.cls+'"'+style+' title="'+esc(t.tip)+'"><span class="nm-title"><span class="nm-ic">'+esc(t.ic)+'</span>'+esc(t.label)+'</span>'+user+'</span>';
}
// Role pills for the profile card (VIP tier, live flair, permanent roles, confetti).
function profileRolesHTML(id){
  let out='';
  try{
    const v=DB.vipInfo(id,true,true);   // profile card ignores the person's hidden tags (those only change their name)
    if(v&&v.kind==='owner')out+='<span class="pf-role owner-role">\u{1F531} Owner</span>';
    else if(v&&v.kind==='mvp')out+='<span class="pf-role mvp-role" title="MVP \u2014 permanent">\u{1F3C6} MVP \u00B7 Forever'+(v.since?' <small>since '+new Date(v.since).toLocaleDateString(undefined,{month:'short',year:'numeric'})+'</small>':'')+'</span>';
    else if(v&&v.kind==='perm')out+='<span class="pf-role vip-perm">\u{1F48E} VIP \u00B7 Forever</span>';
    else if(v&&v.kind==='day')out+='<span class="pf-role vip-day">\u{1F31E} VIP \u2014 1 Day</span>';
    // Custom roles (decorative, backend-only): all of them, highest rank first, right under the tier pill.
    customRolesOf(id).forEach(r=>{
      out+='<span class="pf-role custom-role" style="--rc:'+esc(r.color)+'" title="'+esc(r.name)+'">'+
        (r.icon?esc(r.icon)+' ':'')+esc(r.name)+'</span>';
    });
    const live=DB.flairOf(id),roles=DB.rolesOf(id);
    const seen={};
    const hf=false,hc=false;   // hiding a tag never removes it from the profile
    if(!hf&&live&&VIP_FLAIRS[live]){seen[live]=1;out+='<span class="pf-role fl-'+live+'">'+VIP_FLAIRS[live].e+' '+VIP_FLAIRS[live].n+'</span>'}
    if(!hf)NAME_STYLE_PRESETS.forEach(p=>{if(roles[p]===true&&!seen[p]&&VIP_FLAIRS[p]){seen[p]=1;out+='<span class="pf-role fl-'+p+'">'+VIP_FLAIRS[p].e+' '+VIP_FLAIRS[p].n+'</span>'}});
    if(!hc&&roles.confetti===true)out+='<span class="pf-role fl-confetti">\u{1F389} Confetti Blast</span>';
  }catch(_){}
  return out?'<div class="pf-roles">'+out+'</div>':'';
}
function fmtDur(ms){
  ms=Math.max(0,ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
  if(h>0)return h+'h '+String(m).padStart(2,'0')+'m';
  if(m>0)return m+'m '+String(s).padStart(2,'0')+'s';
  return s+'s';
}
// Which members-only lounge (if any) is open right now: 'vip', 'mvp' or null.
function loungeKind(){return view.roomKey===CFG.VIP_ROOM?'vip':(view.roomKey===CFG.MVP_ROOM?'mvp':null)}
function loungeLocked(kind){return kind==='vip'?!DB.vipInfo(ME.id):(kind==='mvp'?!hasMvpPerks(ME.id):false)}
function renderVipBar(){
  const bar=$('#vipBar');if(!bar||!ME)return;
  const kind=loungeKind();
  const info=kind==='vip'?DB.vipInfo(ME.id):(kind==='mvp'&&hasMvpPerks(ME.id)?{kind:isOwner(ME.id)?'owner':'mvp'}:null);
  bar.classList.toggle('hidden',!(kind&&info));
  if(!kind||!info)return;
  let html;
  if(kind==='mvp'){
    html='<span class="mvp-bar-sp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="vb-gem">🏆</span><div class="vb-txt"><b>MVP Lounge</b><span>The most exclusive room · MVPs only</span></div><span class="vb-pill">'+(info.kind==='owner'?'Owner access':'MVP forever')+'</span>';
  }else{
    const status=info.kind==='perm'?'VIP forever':(info.kind==='mvp'?'Free VIP · MVP':(info.kind==='owner'?'Owner access':'VIP ends in '+fmtDur(info.until-(Date.now()+SKEW))));
    html='<span class="vb-gem">💎</span><div class="vb-txt"><b>VIP Lounge</b><span>Members-only chat</span></div><span class="vb-pill">'+status+'</span>';
  }
  if(bar.dataset.h!==html){bar.dataset.h=html;bar.innerHTML=html}
}
let _vipWasLocked=null;
function applyVipLock(){
  if(!ME)return;
  const kind=loungeKind();
  const locked=!!kind&&loungeLocked(kind);
  const pg=$('#chatPage');if(pg){pg.classList.toggle('vip-mode',kind==='vip');pg.classList.toggle('mvp-mode',kind==='mvp')}
  const vl=$('#vipLock'),mb=$('#messages'),comp=document.querySelector('.composer');
  if(vl){
    vl.classList.toggle('mvp-lock',kind==='mvp');
    vl.classList.toggle('hidden',!locked);
    const g=vl.querySelector('.vl-gem'),h=vl.querySelector('h2'),p=vl.querySelector('p');
    if(kind==='mvp'){
      if(g)g.textContent='🏆';if(h)h.textContent='MVP Lounge';
      if(p)p.textContent='Only MVPs can come in. MVP is a 0.1% prize on the Daily Spin, or an owner can give it to you.';
    }else{
      if(g)g.textContent='💎';if(h)h.textContent='VIP Lounge';
      if(p)p.textContent='A members-only room. Win VIP from the Daily Spin — you get one free spin every day.';
    }
  }
  if(mb)mb.classList.toggle('hidden',locked);
  if(comp&&locked)comp.classList.add('hidden');
  _vipWasLocked=kind?locked:null;
  renderVipBar();
}
// Called whenever VIP/MVP data or owner data changes: re-attach (or drop) the lounge message listener and
// redraw only if this room's locked/unlocked state actually flipped.
function refreshVipUI(){
  if(!ME||typeof view==='undefined')return;
  const kind=loungeKind();
  if(kind){
    const locked=loungeLocked(kind);
    if(_vipWasLocked!==locked){DB.watchMessages(view.roomKey);renderChat()}
    else renderVipBar();
  }
  refreshSpinUI();
}
$('#vlSpin').onclick=()=>openSpin();
// One light timer: countdown in the VIP bar, expiry of a 1-day VIP, and the spin cooldown.
setInterval(()=>{
  try{
    if(!ME)return;
    if(loungeKind())refreshVipUI();
    if($('#spinBtn'))setSpinBtn();
  }catch(_){}
},1000);

/* ----- Daily Spin ----- */
let _spinBusy=false,_wheelRot=0;
function rollPrize(){
  // Odds are the pct values (they add up to 100). Normalising by the real total keeps rounding from ever skewing the roll.
  const total=SPIN_PRIZES.reduce((t,p)=>t+p.pct,0);
  const buf=new Uint32Array(1);crypto.getRandomValues(buf);
  let r=(buf[0]/4294967296)*total,acc=0;
  for(const p of SPIN_PRIZES){acc+=p.pct;if(r<acc)return p}
  return SPIN_PRIZES[0];
}
const fmtPct=n=>String(Math.round(n*10)/10);
// The wheel has one equal slice per prize (slice size is cosmetic; the real odds are in the list under it).
const sliceDeg=()=>360/SPIN_PRIZES.length;
function wheelSVG(){
  const R0=150,C0=160,SL=sliceDeg(),pt=(deg,r)=>{const a=deg*Math.PI/180;return[(C0+r*Math.sin(a)).toFixed(2),(C0-r*Math.cos(a)).toFixed(2)]};
  let out='<svg viewBox="0 0 320 320" aria-hidden="true">';
  SPIN_PRIZES.forEach((p,i)=>{
    const a=pt(i*SL,R0),b=pt((i+1)*SL,R0),m=pt(i*SL+SL/2,102);
    out+='<path d="M160 160 L'+a[0]+' '+a[1]+' A150 150 0 0 1 '+b[0]+' '+b[1]+' Z" fill="'+p.color+'" stroke="rgba(255,255,255,.14)" stroke-width="1"/>';
    out+='<text transform="translate('+m[0]+' '+m[1]+') rotate('+(i*SL+SL/2)+')" text-anchor="middle" dominant-baseline="central" font-size="25">'+p.e+'</text>';
  });
  return out+'</svg>';
}
/* Spin allowance. Everyone: 1 spin per 24h (lastSpin/$id). MVPs: CFG.MVP_SPINS_PER_DAY spins inside a rolling 24h window
   that starts with their first spin (spinWin/$id = {at,n}). */
function spinState(){
  const now=Date.now()+SKEW;
  if(ME&&isMvp(ME.id)){
    const max=CFG.MVP_SPINS_PER_DAY,w=DB.spinWindow();
    if(w&&typeof w.at==='number'&&w.at+86400000>now){
      const used=Math.max(0,Number(w.n)||0),end=w.at+86400000;
      return used<max?{max,left:max-used,wait:0,used,at:w.at,fresh:false}:{max,left:0,wait:end-now,used,at:w.at,fresh:false};
    }
    return{max,left:max,wait:0,used:0,at:0,fresh:true};      // no live window: the next spin opens a new one
  }
  const last=DB.lastSpinAt();
  const wait=(!last||last+86400000<=now)?0:(last+86400000-now);
  return{max:1,left:wait?0:1,wait,used:wait?1:0,at:0,fresh:true};
}
function spinReady(){return spinState().wait}
function setSpinBtn(){
  const b=$('#spinBtn');if(!b)return;
  const st=spinState();
  if(_spinBusy){b.disabled=true;b.textContent='Spinning…';return}
  if(st.wait>0){b.disabled=true;b.textContent='Next free spin in '+fmtDur(st.wait);return}
  b.disabled=false;b.textContent=st.max>1?'Spin the wheel · '+st.left+' of '+st.max+' left':'Spin the wheel';
}
function refreshSpinUI(){
  if(!$('#spinBtn'))return;
  setSpinBtn();
  if(_spinBusy)return;     // don't reveal the new role/Hall entry while the wheel is still turning (doSpin refreshes when it stops)
  const box=$('#spinRoles');if(box)box.innerHTML=spinRolesHTML();
  const hall=$('#mvpHall');if(hall)hall.innerHTML=mvpHallHTML();
}
function spinRolesHTML(){
  const mine=DB.rolesOf(ME.id);
  const keys=Object.keys(ROLE_LABELS);
  const has=k=>k==='mvp'?isMvp(ME.id):mine[k]===true;     // MVP is read from mvp/, so an owner removing it takes the chip away
  const have=keys.filter(has).length;
  return '<div class="sr-head">Your roles <span>'+have+' of '+keys.length+'</span></div><div class="sr-grid">'+
    keys.map(k=>'<span class="sr-chip'+(has(k)?' on':'')+(k==='mvp'?' mvp':'')+'">'+ROLE_LABELS[k]+'</span>').join('')+'</div>';
}
// Bragging rights: everyone who has ever won (or been given) MVP, oldest first.
function mvpHallHTML(){
  const ids=DB.mvpIds().sort((a,b)=>(DB.mvpSince(a)||Infinity)-(DB.mvpSince(b)||Infinity)||a-b);
  const head='<div class="mh-head">🏆 Hall of MVPs <span>'+ids.length+'</span></div>';
  if(!ids.length)return head+'<div class="mh-empty">Nobody yet. It is a 0.1% prize, so the first one gets the glory.</div>';
  return head+'<div class="mh-grid">'+ids.slice(0,40).map(id=>{
    const u=DB.getUser(id),nm=u?displayUsername(u.username):'User '+id,since=DB.mvpSince(id);
    return '<span class="mh-chip'+(id===ME.id?' me':'')+'" title="'+(since?'MVP since '+esc(new Date(since).toLocaleDateString()):'MVP')+'">'+esc(nm)+'</span>';
  }).join('')+(ids.length>40?'<span class="mh-chip more">+'+(ids.length-40)+' more</span>':'')+'</div>';
}
function mvpPerksHTML(){
  return '<details class="mvp-perks"><summary>🏆 What does MVP give you?</summary><ul>'+
    '<li><b>Permanent</b> — forever, unless an owner removes it</li>'+
    '<li><b>3 Daily Spins</b> instead of 1</li>'+
    '<li><b>2x longer messages</b> ('+(CFG.MAX_MSG*CFG.MVP_MSG_MULT)+' characters)</li>'+
    '<li><b>'+CFG.MVP_DESC_MAX+'-character</b> profile descriptions</li>'+
    '<li><b>Image banners</b> instead of just colors</li>'+
    '<li><b>MVP Chat</b> and <b>free permanent VIP</b></li>'+
    '<li>Special animated username effect and 🏆 title</li>'+
    '<li>Listed above Admins and Mods in the member list</li>'+
    '<li>No moderator or admin powers — just perks and bragging rights</li>'+
    '</ul></details>';
}
function openSpin(){
  if(!ME)return;
  $('#modalRoot').innerHTML=`<div class="modal-bg" id="spinBg"><div class="modal spin-modal">
    <button class="spin-x" id="spinX" type="button" aria-label="Close">✕</button>
    <h2>Daily Spin</h2>
    <p class="spin-sub">One free spin every day (MVPs get ${CFG.MVP_SPINS_PER_DAY}). Flairs show next to your name for 24 hours, VIP opens the VIP Lounge, and every prize you win is saved to your profile as a role.</p>
    <div class="spin-stage">
      <div class="spin-ptr"></div>
      <div class="spin-wheel" id="spinWheel" style="transform:rotate(${_wheelRot}deg)">${wheelSVG()}</div>
      <div class="spin-hub">🎯</div>
    </div>
    <div class="spin-res" id="spinRes" aria-live="polite"></div>
    <button class="btn spin-go" id="spinBtn" type="button"></button>
    <div class="odds-grid">${SPIN_PRIZES.map(p=>'<div class="odd'+(p.id==='vip1'||p.id==='vipperm'?' vip':'')+(p.id==='mvp'?' mvp':'')+'"><span>'+p.e+' '+p.name+'</span><b>'+fmtPct(p.pct)+'%</b></div>').join('')}</div>
    ${mvpPerksHTML()}
    <div class="spin-roles" id="spinRoles">${spinRolesHTML()}</div>
    <div class="mvp-hall" id="mvpHall">${mvpHallHTML()}</div>
  </div></div>`;
  const close=()=>{const bg=$('#spinBg');if(!bg)return;bg.classList.add('closing');setTimeout(()=>{if($('#spinBg'))$('#modalRoot').innerHTML=''},220)};
  $('#spinBg').onclick=e=>{if(e.target.id==='spinBg')close()};
  $('#spinX').onclick=close;
  $('#spinBtn').onclick=doSpin;
  setSpinBtn();
}
function burstConfetti(n){
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(document.documentElement.classList.contains('anti-lag'))return;
  const host=document.createElement('div');host.className='cfx';
  const cols=['#ff5fc0','#ffd84d','#5aa9ff','#4cd6a0','#ff7a45','#a78bfa'];
  for(let i=0;i<n;i++){
    const p=document.createElement('i');
    p.style.cssText='--x:'+(Math.random()*100)+'vw;--dx:'+((Math.random()-.5)*160)+'px;--r:'+(Math.random()*720-360)+'deg;--d:'+(1.6+Math.random()*1.6)+'s;--w:'+(6+Math.random()*6)+'px;background:'+cols[i%cols.length]+';animation-delay:'+(Math.random()*.35)+'s';
    host.appendChild(p);
  }
  document.body.appendChild(host);setTimeout(()=>host.remove(),3800);
}
async function doSpin(){
  if(_spinBusy||!ME)return;
  const res=$('#spinRes');
  const st=spinState();
  if(st.wait>0){setSpinBtn();return}
  _spinBusy=true;setSpinBtn();res.className='spin-res';res.textContent='';
  const prize=rollPrize(),id=ME.id;
  const serverNow=Math.round(Date.now()+SKEW);
  const up={};
  const wasMvp=isMvp(id);
  // One atomic update: the spin marker and the prize either all save or none do.
  up['lastSpin/'+id]=serverTimestamp();
  // MVPs spin up to CFG.MVP_SPINS_PER_DAY times per rolling 24h window. Winning MVP also opens a window (this spin is #1),
  // so a brand-new MVP still has the rest of that day's spins.
  if(wasMvp||prize.id==='mvp')up['spinWin/'+id]={at:st.fresh?serverNow:st.at,n:st.fresh?1:st.used+1};
  if(prize.flair)up['flair/'+id]={preset:prize.flair,until:serverNow+86400000};
  if(prize.id==='vip1'){
    const cur=DB.vipInfo(id);
    if(!(cur&&(cur.kind==='perm'||cur.kind==='mvp')))up['vip/'+id]={until:serverNow+86400000};
  }
  if(prize.id==='vipperm')up['vip/'+id]={perm:true};
  if(prize.id==='mvp'){if(!wasMvp)up['mvp/'+id]=serverNow}      // the MVP chip/tier read mvp/ directly, so no roles/ entry is needed
  else if(prize.role)up['roles/'+id+'/'+prize.role]=true;
  try{
    await update(ref(rtdb),up);
  }catch(e){
    console.error('spin write failed',e,Object.keys(up));
    _spinBusy=false;setSpinBtn();
    res.className='spin-res bad';
    res.textContent='The spin could not be saved ('+(e.code||e.message)+'). Blocked paths: '+Object.keys(up).join(', ')+'.'+(/mvp|spinWin/.test(Object.keys(up).join(','))?' If this is about MVP, publish the MVP database rules (SETUP-MVP.md).':'');
    return;
  }
  const idx=SPIN_PRIZES.indexOf(prize);
  const SL=sliceDeg(),jitter=(Math.random()-.5)*SL*.55;
  const mid=idx*SL+SL/2+jitter;
  const d=(((-(mid+_wheelRot))%360)+360)%360;
  const startRot=_wheelRot;
  _wheelRot=_wheelRot+360*6+d;
  const wheel=$('#spinWheel');
  // Drive the spin with the Web Animations API instead of a CSS transition. A CSS transition gets
  // silently skipped on machines with "reduce motion"/animations turned off (common on Chromebooks and
  // desktops) or by any transition:none override, which is why it only spun on phones. An explicit
  // animation always plays. (Reduced-motion users get a shorter spin instead of none, so the result still reads.)
  const slow=!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dur=slow?5200:2600;
  if(wheel){
    const fin='rotate('+_wheelRot+'deg)';
    wheel.style.transition='none';
    wheel.style.transform='rotate('+startRot+'deg)';
    void wheel.offsetWidth;
    if(wheel.animate){
      const an=wheel.animate([{transform:'rotate('+startRot+'deg)'},{transform:fin}],{duration:dur,easing:'cubic-bezier(.12,.72,.14,1)',fill:'forwards'});
      wheel.style.transform=fin;
      an.onfinish=()=>{try{an.cancel()}catch(_){}};
    }else{
      wheel.style.transition='transform '+(dur/1000)+'s cubic-bezier(.12,.72,.14,1)';
      wheel.style.transform=fin;
    }
  }
  setTimeout(()=>{
    _spinBusy=false;setSpinBtn();refreshSpinUI();
    const r2=$('#spinRes');
    if(r2){r2.className='spin-res win';r2.innerHTML='<span class="sr-e">'+prize.e+'</span><div><b>'+prize.name+'</b><span>'+prize.msg+'</span></div>'}
    if(prize.id!=='none'&&prize.id!=='close')burstConfetti(prize.id==='mvp'?260:(prize.id==='vipperm'?140:(prize.id==='confetti'?110:60)));
    if(prize.id==='vip1'||prize.id==='vipperm')toast('VIP unlocked. Open VIP Chat from the chat menu.');
    if(prize.id==='mvp'){
      if(wasMvp){const r3=$('#spinRes');if(r3)r3.querySelector('span:not(.sr-e)').textContent='You already are an MVP, so this is pure bragging rights. Nice.'}
      else toast('🏆 You are an MVP! Open MVP Chat from the chat menu.');
    }
  },dur+200);
}
