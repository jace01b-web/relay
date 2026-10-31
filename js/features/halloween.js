/* ==========================================================================
 * js/features/halloween.js
 * Halloween season pass, decorations and cosmetics (delete this file to remove the event)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

const HW={S:1790726400000,E:1794096000000,G:604800000,N:30,K:'ich.hwTheme',IV:1};   /* IV = guide version: raise it to show the guide again to everyone (flag lives at halloween/intro/<id>) */   // start 2026-09-30, end 2026-11-08, +7 day claim grace
const hwNow=()=>Date.now()+(typeof SKEW==='number'?SKEW:0);
const hwOpen=()=>hwNow()>=HW.S&&hwNow()<=HW.E;
const hwCanClaim=()=>hwNow()>=HW.S&&hwNow()<=HW.E+HW.G;
const hwCum=n=>2*n*n+13*n;
/* Finishing the WHOLE pass (all 30 levels claimed) keeps the Halloween theme forever. Everyone else loses the theme and its
   switch when the event ends. A tiny local flag avoids a flash of the normal look on load, before the claimed list arrives. */
const hwForever=id=>{
  if(id==null)return false;
  if(Math.min(HW.N,Math.max(0,Number((window.HW_CLAIMED||{})[id])||0))>=HW.N)return true;
  if(!window.HW_CLAIMED){try{return localStorage.getItem('ich.hwForever')===String(id)}catch(_){}}
  return false;
};
const hwThemeAvail=()=>hwOpen()||(typeof ME!=='undefined'&&!!ME&&hwForever(ME.id));
// [emoji, name, kind(b=badge, n=name effect, t=title pill + name effect), fx]
const HW_R=[
 ['🍬','Candy Corn','b'],['🕯️','Candlelight','b'],['🦇','Bat Wings','b'],['🍭','Sweet Tooth','b'],['🕸️','Cobweb','n','web'],
 ['🍫','Trick or Treat','b'],['👻','Friendly Ghost','n','ghost'],['🌙','Harvest Moon','b'],['🎃','Pumpkin Patch','n','pumpkin'],['🕷️','Creeping Spider','b'],
 ['🧪','Potion Master','b'],['🧙','Witch\'s Brew','n','witch'],['🐈‍⬛','Black Cat','b'],['🔮','Crystal Ball','b'],['🦴','Skeleton Crew','n','bone'],
 ['🪦','Graveyard Shift','b'],['🧟','Zombie','n','zombie'],['🩸','Blood Moon','b'],['🧛','Vampire','t','vamp'],['🐺','Werewolf','n','wolf'],
 ['🪄','Hex','b'],['⚰️','Haunted Coffin','b'],['🔥','Hellfire','n','hell'],['😈','Imp','b'],['💀','Grim Reaper','t','reaper'],
 ['🏚️','Haunted Manor','b'],['🌌','Midnight Spirit','n','spirit'],['🎃','Headless Horseman','t','horse'],['☠️','Lord of the Dead','n','lord'],['👑','Hallow Royalty','t','royal']
];
const HW_KIND={b:'Badge',n:'Name effect',t:'Title + effect'};
const hwLevel=id=>Math.min(HW.N,Math.max(0,Number((window.HW_CLAIMED||{})[id])||0));
/* Equipped cosmetics live at halloween/equipped/<id> = {fx,title,badge}, each the LEVEL number (1-30) of the reward being shown,
   or 0 for "none". A missing key means "auto" (the best one you own, the original behaviour). A level above what you own, or one of
   the wrong kind, is ignored, so a tampered value can never show something you haven't unlocked. */
function hwPick(id,key,kinds,def){
  const L=hwLevel(id),e=(window.HW_EQ||{})[id];
  if(!e||e[key]===undefined||e[key]===null)return def;
  const n=Math.floor(Number(e[key]));
  if(n===0)return null;
  if(!(n>=1&&n<=L))return def;
  const r=HW_R[n-1];return kinds.indexOf(r[2])>-1?r:def;
}
function hwStyleOf(id){
  const L=hwLevel(id);if(!L)return null;
  let dfx=null,dt=null,db=null;
  for(let i=0;i<L;i++){const r=HW_R[i];if(r[2]==='b')db=r;else{dfx=r;if(r[2]==='t')dt=r}}
  const fx=hwPick(id,'fx',['n','t'],dfx),t=hwPick(id,'title',['t'],dt),b=hwPick(id,'badge',['b'],db);
  return{fx:fx?fx[3]:null,title:t,badges:b?[b[0]]:[]};
}
function hwWrap(id,html,plain){
  try{
    const s=hwStyleOf(id);if(!s)return html;
    const on=(typeof customNamesOn!=='function')||customNamesOn();
    let out=html;
    if(on&&s.fx)out='<span class="hw-name hw-s-'+s.fx+(plain?' hw-plain':'')+'">'+html+'</span>';
    if(on&&s.title)out='<span class="hw-title hw-t-'+s.title[3]+'">'+s.title[0]+' '+s.title[1].split(' ').pop()+'</span>'+out;
    return out+s.badges.map(b=>'<span class="hw-bdg">'+b+'</span>').join('');
  }catch(_){return html}
}
let _hwIn=false;
{
  const oFull=fullNameHTML,oStyled=styledNameHTML,oProf=profileRolesHTML;
  styledNameHTML=function(id,n){const h=oStyled(id,n);return _hwIn?h:hwWrap(id,h,!nameStylePreset(id))};
  fullNameHTML=function(id,n){let h;_hwIn=true;try{h=oFull(id,n)}finally{_hwIn=false}return hwWrap(id,h,!vipTierOf(id)&&!nameStylePreset(id))};
  profileRolesHTML=function(id){
    const h=oProf(id),L=hwLevel(id);if(!L)return h;
    const p='<span class="pf-role hw-pf">🎃 Halloween Pass · Lv '+L+'</span>'+HW_R.slice(0,L).filter(r=>r[2]!=='b').map(r=>'<span class="pf-role hw-pf">'+r[0]+' '+r[1]+'</span>').join('');
    return h?h.replace(/<\/div>\s*$/,p+'</div>'):'<div class="pf-roles">'+p+'</div>';
  };
}
/* ---------- decorations (turn off in Settings → Halloween) ---------- */
function hwWant(){
  try{const s=ME&&ME.settings&&ME.settings.hwTheme;if(typeof s==='boolean')return s}catch(_){}
  try{return localStorage.getItem(HW.K)!=='0'}catch(_){return true}
}
function hwSetTheme(v,src){
  try{localStorage.setItem(HW.K,v?'1':'0')}catch(_){}
  if(ME){ME.settings=ME.settings||{};ME.settings.hwTheme=v}   /* keep the in-memory copy fresh: hwWant() reads it first, a stale value made the theme flip back off */
  if(ME&&ME.id!=null)DB.setSettingKey(ME.id,'hwTheme',v).catch(()=>{});
  const fancy=src&&!document.documentElement.classList.contains('anti-lag')&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!fancy){hwSync();return}
  /* same as the launcher: an expanding glow from the switch, then the theme swaps underneath it */
  const rc=(src.closest('.switch')||src).getBoundingClientRect(),rp=document.createElement('div');
  rp.className='hw-ripple '+(v?'on':'off');rp.style.left=(rc.left+rc.width/2)+'px';rp.style.top=(rc.top+rc.height/2)+'px';
  document.body.appendChild(rp);setTimeout(()=>rp.remove(),1000);
  setTimeout(()=>{hwSync();if(v)hwBurst(true)},160);
}
/* Safety net: if 17-halloween.css didn't make it onto this device (blocked/failed fetch), pull the raw file in directly. */
function hwEnsureCss(){
  try{
    const d=document.getElementById('hwDeco');if(!d||window.__hwCssOk)return;
    if(getComputedStyle(d).position==='fixed'){window.__hwCssOk=true;return}
    if(window.__hwCssBusy)return;window.__hwCssBusy=true;
    const m=document.querySelector('meta[name="build-version"]'),q=m&&m.content?'?v='+encodeURIComponent(m.content):'';
    const urls=['https://raw.githubusercontent.com/jace01b-web/itsukis-chat-hub-obfuscated/main/css/17-halloween.css','https://cdn.jsdelivr.net/gh/jace01b-web/itsukis-chat-hub-obfuscated@main/css/17-halloween.css'];
    const go=i=>{
      if(i>=urls.length){window.__hwCssBusy=false;return}
      fetch(urls[i]+q,{cache:'reload'}).then(r=>{if(!r.ok)throw 0;return r.text()}).then(t=>{
        const st=document.createElement('style');st.setAttribute('data-css','17-halloween.css (fallback)');st.textContent=t;document.head.appendChild(st);
        window.__hwCssBusy=false;window.__hwCssOk=getComputedStyle(d).position==='fixed';
      }).catch(()=>go(i+1));
    };
    go(0);
  }catch(_){}
}
function hwDeco(on){
  document.documentElement.classList.toggle('hw-on',on);
  let d=document.getElementById('hwDeco');
  if(!on){
    if(!d||d.classList.contains('out'))return;
    if(document.documentElement.classList.contains('anti-lag')){d.remove();return}
    d.classList.add('out');clearTimeout(d._rm);d._rm=setTimeout(()=>d.remove(),1000);   /* pieces fade out like the launcher */
    return;
  }
  if(d){if(d.classList.contains('out')){clearTimeout(d._rm);d.classList.remove('out')}return}
  const r=(a,b)=>(a+Math.random()*(b-a)).toFixed(2);
  const web='<svg viewBox="0 0 120 120"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M0 0L120 0M0 0L0 120M0 0L100 60M0 0L60 100M0 0L115 25M0 0L25 115"/><path d="M0 30Q18 18 30 0M0 55Q32 36 55 0M0 82Q50 58 82 0M0 110Q70 82 110 0"/></g></svg>';
  let h='<i class="hw-vig"></i><i class="hw-moon"></i><i class="hw-fog"></i><i class="hw-fog f2"></i><div class="hw-web l">'+web+'</div><div class="hw-web r">'+web+'</div>'
    +'<span class="hw-sp" style="--x:14%;--l:60px"><u></u><b>🕷️</b></span><span class="hw-sp hw-x" style="--x:86%;--l:90px"><u></u><b>🕷️</b></span>';
  for(let i=0;i<7;i++)h+='<b class="hw-bat'+(i>2?' hw-x':'')+'" style="--y:'+r(6,55)+'vh;--s:'+r(16,28)+'px;--d:'+r(16,30)+'s;--t:-'+r(0,24)+'s"><i>🦇</i></b>';
  for(let i=0;i<4;i++)h+='<b class="hw-gh'+(i>1?' hw-x':'')+'" style="--x:'+r(4,92)+'%;--d:'+r(20,34)+'s;--t:-'+r(0,30)+'s">👻</b>';
  for(let i=0;i<16;i++)h+='<i class="hw-em'+(i>7?' hw-x':'')+'" style="--x:'+r(0,100)+'%;--s:'+r(2,5)+'px;--dx:'+r(-60,60)+'px;--d:'+r(9,18)+'s;--t:-'+r(0,16)+'s"></i>';
  h+='<b class="hw-pk l">🎃</b><b class="hw-pk r hw-x">🎃</b>';
  d=document.createElement('div');d.id='hwDeco';d.className='hw-deco';d.setAttribute('aria-hidden','true');d.innerHTML=h;
  document.body.insertBefore(d,document.body.firstChild);
  hwEnsureCss();   // first child + z-index 0 = sits behind every page and panel, so it can never cover or shift UI
}
/* ---------- season pass ---------- */
function hwProg(){
  const p=window.HW_PROG||{},m=Math.max(0,Number(p.mins)||0);let lvl=0;
  while(lvl<HW.N&&hwCum(lvl+1)<=m)lvl++;
  return{m,lvl,last:Number(p.last)||0};
}
const hwFmt=m=>{m=Math.max(0,Math.ceil(m));const h=Math.floor(m/60),x=m%60;return h?h+'h '+String(x).padStart(2,'0')+'m':x+'m'};
function hwClaimable(){if(!ME)return 0;const{lvl}=hwProg();return Math.max(0,lvl-hwLevel(ME.id))}
function hwBurst(noConfetti){
  if(document.documentElement.classList.contains('anti-lag'))return;
  const em=['🎃','🦇','👻','🕸️','🍬','💀'];
  for(let i=0;i<22;i++){const e=document.createElement('b');e.className='hw-pop';e.style.cssText='--x:'+(20+Math.random()*60)+'vw;--y:'+(55+Math.random()*25)+'vh;--dx:'+((Math.random()-.5)*220)+'px;--r:'+((Math.random()-.5)*80)+'deg;animation-delay:'+(Math.random()*.35)+'s';e.textContent=em[i%em.length];document.body.appendChild(e);setTimeout(()=>e.remove(),2200)}
  if(!noConfetti&&typeof burstConfetti==='function')burstConfetti(50);
}
function hwRowsHTML(){
  const{m,lvl}=hwProg(),have=ME?hwLevel(ME.id):0;
  return HW_R.map((r,i)=>{
    const L=i+1,done=L<=have,ready=!done&&L<=lvl,big=r[2]!=='b';
    const nm=r[3]?'<span class="hw-name hw-plain hw-s-'+r[3]+'">'+r[1]+'</span>':r[1];
    const cost=hwCum(L)-hwCum(L-1);
    const sub=done?'Claimed':ready?'Ready to claim!':'Needs '+hwFmt(hwCum(L)-m)+' more online';
    const act=done?'<span class="hw-ok">✓ Owned</span>':ready?'<button class="hw-btn" data-l="'+L+'" type="button">Claim</button>':'<span class="hw-ok" style="color:var(--muted)">🔒</span>';
    return '<div class="hw-row'+(done?' done':ready?' ready':' lock')+(big?' big':'')+'" style="--i:'+i+'"><div class="hw-lv">'+L+'</div><div class="hw-ic">'+r[0]+'</div><div class="hw-tx"><b>'+nm+(big?'<span class="hw-tag">'+HW_KIND[r[2]]+'</span>':'')+'</b><span>'+sub+' · level costs '+hwFmt(cost)+'</span></div>'+act+'</div>';
  }).join('');
}
function hwHeadStatsHTML(){
  const{m,lvl,last}=hwProg(),next=lvl<HW.N?hwCum(lvl+1)-m:0,span=lvl<HW.N?hwCum(lvl+1)-hwCum(lvl):1;
  const into=lvl<HW.N?m-hwCum(lvl):span,pct=Math.min(100,Math.round(into/span*100));
  const extra=(document.hidden||!last)?0:Math.min(59,Math.floor((hwNow()-last)/1000));
  const t=Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m '+String(Math.max(0,extra)).padStart(2,'0')+'s';
  return '<div class="hw-stats"><div class="hw-stat"><b>'+lvl+' / '+HW.N+'</b><span>Level</span></div><div class="hw-stat"><b>'+(m/60).toFixed(1)+'</b><span>Hours</span></div><div class="hw-stat"><b id="hwTime">'+t+'</b><span>Time online</span></div></div>'
    +'<div class="hw-bar"><i style="--p:'+pct+'%"></i></div><div class="hw-bar-t"><span>'+(lvl<HW.N?'Level '+(lvl+1)+' in '+hwFmt(next):'Max level reached! 👑')+'</span><span>'+pct+'%</span></div>';
}
let _hwTimer=null;
function hwRender(){
  const bg=document.getElementById('hwBg');if(!bg)return;
  const hs=bg.querySelector('#hwHeadStats'),ls=bg.querySelector('.hw-list');
  if(hs)hs.innerHTML=hwHeadStatsHTML();
  if(ls){const y=ls.scrollTop;ls.innerHTML=hwRowsHTML();ls.scrollTop=y}
  const n=hwClaimable(),b=bg.querySelector('#hwAll');if(b){b.disabled=n<1||!hwCanClaim();b.textContent=n?'🎁 Claim '+n+' reward'+(n>1?'s':''):'Nothing to claim yet'}
}
async function hwClaim(L){
  if(!ME||!hwCanClaim())return;
  const id=ME.id;L=Math.min(L,hwProg().lvl);
  if(L<=hwLevel(id))return;
  try{
    await set(ref(rtdb,'halloween/claimed/'+id),L);
    window.HW_CLAIMED={...(window.HW_CLAIMED||{}),[id]:L};
    hwBurst();toast('🎃 Claimed up to level '+L+': '+HW_R[L-1][1]+'!');hwRender();hwSync();
  }catch(e){console.warn('halloween claim failed',e);toast('Could not claim: '+((e&&e.message)||'try again'),'bad')}
}
function hwModal(){
  if(!ME||!hwCanClaim())return;
  const root=document.getElementById('modalRoot');if(!root)return;
  root.innerHTML='<div class="modal-bg" id="hwBg"><div class="modal hw-modal" role="dialog" aria-modal="true" aria-label="Halloween Season Pass"><button class="hw-help" id="hwHelp" type="button" aria-label="How the Halloween Pass works" title="How it works">?</button><button class="hw-x" id="hwX" type="button" aria-label="Close">✕</button>'
    +'<div class="hw-head"><span class="hw-big">🎃</span><h2>Halloween Season Pass</h2><p>Spend time online to level up. '+HW.N+' levels of spooky badges, name effects and permanent roles. Every level takes a little longer than the last. <b>Claim all '+HW.N+' levels to keep the Halloween theme forever</b> — after the event ends, everyone else loses it.</p><div id="hwHeadStats"></div></div>'
    +'<div class="hw-list"></div><div class="hw-foot"><button class="hw-btn" id="hwAll" type="button" disabled>Nothing to claim yet</button><button class="hw-btn" id="hwCos" type="button" style="flex:none;background:rgba(255,255,255,.1);color:var(--text);box-shadow:none">✨ Customize</button></div></div></div>';
  const close=()=>{const bg=document.getElementById('hwBg');if(!bg)return;clearInterval(_hwTimer);bg.classList.add('closing');setTimeout(()=>{if(document.getElementById('hwBg'))root.innerHTML=''},220)};
  document.getElementById('hwBg').onclick=e=>{if(e.target.id==='hwBg')close();const b=e.target.closest&&e.target.closest('.hw-btn[data-l]');if(b)hwClaim(+b.dataset.l)};
  document.getElementById('hwX').onclick=close;
  document.getElementById('hwHelp').onclick=()=>hwIntroShow(true);
  document.getElementById('hwAll').onclick=()=>hwClaim(hwProg().lvl);
  document.getElementById('hwCos').onclick=openCosmetics;
  hwRender();clearInterval(_hwTimer);
  _hwTimer=setInterval(()=>{const bg=document.getElementById('hwBg');if(!bg){clearInterval(_hwTimer);return}const hs=bg.querySelector('#hwHeadStats');if(hs&&!document.hidden){const t=bg.querySelector('#hwTime');if(t){const{m,last}=hwProg();const ex=last?Math.min(59,Math.max(0,Math.floor((hwNow()-last)/1000))):0;t.textContent=Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m '+String(ex).padStart(2,'0')+'s'}}},1000);
  hwMaybeIntro();
}
/* ---------- first-time guide: shown the first time the pass is opened; the \"seen\" flag is saved to the account (halloween/intro/<id>) so it follows you across devices ---------- */
const hwIntroKey=()=>'ich.hwIntro.'+(ME&&ME.id);
function hwIntroSeen(){
  let loc=0;try{loc=Number(localStorage.getItem(hwIntroKey()))||0}catch(_){}
  return Math.max(Number(window.HW_INTRO)||0,loc)>=HW.IV;
}
async function hwIntroMark(){
  if(!ME)return;
  try{localStorage.setItem(hwIntroKey(),String(HW.IV))}catch(_){}
  if((Number(window.HW_INTRO)||0)>=HW.IV)return;
  try{await set(ref(rtdb,'halloween/intro/'+ME.id),HW.IV);window.HW_INTRO=HW.IV}
  catch(e){console.warn('halloween guide flag not saved',e)}
}
let _hwiOpen=false;
function hwMaybeIntro(){
  if(_hwiOpen||!ME||!document.getElementById('hwBg')||document.querySelector('.hwi'))return;
  if(!(window.HW_INTRO_LOADED||performance.now()>8000)){setTimeout(hwMaybeIntro,1200);return}   // wait for the saved flag so it never flashes for someone who already saw it
  if(hwIntroSeen()){if(window.HW_INTRO_LOADED&&(Number(window.HW_INTRO)||0)<HW.IV)hwIntroMark();return}
  hwIntroShow(false);
}
function hwIntroShow(replay){
  const modal=document.querySelector('#hwBg .hw-modal');if(!modal||_hwiOpen)return;
  _hwiOpen=true;
  const D=t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  const total=hwCum(HW.N),hrs=(total/60).toFixed(1).replace(/\.0$/,''),days=Math.max(1,Math.round((HW.E-HW.S)/864e5)),perDay=Math.round(total/days);
  const nB=HW_R.filter(r=>r[2]==='b').length,nN=HW_R.filter(r=>r[2]==='n').length,nT=HW_R.filter(r=>r[2]==='t').length;
  const lv=ME?hwProg().lvl:0;
  const prev=(fx,t)=>{const title=t?'<span class="hw-title hw-t-'+fx+'">'+t+'</span>':'';return title+'<span class="hw-name hw-plain hw-s-'+fx+'">YourName</span>'};
  const rw=(L,kind,fx,t)=>'<div class="hwi-rw hwi-in" style="--n:'+(2+Math.floor(L/6))+'"><small>Lv '+L+' · '+kind+'</small><span class="nm">'+prev(fx,t)+'</span></div>';
  const card=(i,ic,h,p)=>'<div class="hwi-card hwi-in" style="--n:'+i+'"><div class="hwi-ci">'+ic+'</div><div><b>'+h+'</b><span>'+p+'</span></div></div>';
  const slides=[
    '<div class="hwi-ring hwi-in"><span>🎃</span></div><div class="hwi-h hwi-in" style="--n:1">The Halloween Season Pass is here!</div>'
      +'<div class="hwi-p hwi-in" style="--n:2">Hang out in Itsukis Chat, level up and unlock spooky badges, glowing name effects and permanent roles. No purchase needed. Just be online.</div>'
      +'<div class="hwi-chips hwi-in" style="--n:3"><span class="hwi-chip">🗓️ '+D(HW.S)+' → '+D(HW.E)+'</span><span class="hwi-chip">🏆 '+HW.N+' levels</span><span class="hwi-chip">🎁 Claim until '+D(HW.E+HW.G)+'</span></div>',
    '<div class="hwi-h hwi-in">How it works</div>'
      +card(1,'⏱️','Just be online','You earn 1 minute of progress for every minute you are logged in and connected. No need to click or type, so you can leave it running and go AFK.')
      +card(2,'📈','Level up','There are '+HW.N+' levels and each takes 4 minutes longer than the last. Level 1 takes '+hwFmt(hwCum(1))+', level '+HW.N+' takes '+hwFmt(hwCum(HW.N)-hwCum(HW.N-1))+'. About '+hrs+' hours in total, roughly '+perDay+' min a day.')
      +card(3,'🎁','Claim your rewards','Open the pass and tap Claim (or Claim all). Everything up to your level is yours to keep.'),
    '<div class="hwi-h hwi-in">Spooky rewards</div>'
      +'<div class="hwi-p hwi-in" style="--n:1">'+nB+' badges, '+nN+' name effects and '+nT+' special titles. Your newest badge, effect and title show next to your name in chat. A few examples:</div>'
      +'<div class="hwi-grid">'+rw(5,'Cobweb','web')+rw(7,'Ghost','ghost')+rw(12,'Witch','witch')+rw(19,'Title','vamp','🧛 Vampire')+rw(23,'Hellfire','hell')+rw(25,'Title','reaper','💀 Reaper')+rw(28,'Title','horse','🎃 Horseman')+rw(30,'Title','royal','👑 Royalty')+'</div>',
    '<div class="hwi-h hwi-in">What\'s new</div>'
      +card(1,'🎃','Halloween theme','Bats, ghosts, fog and cobwebs with an orange and purple look. Turn it off in Settings → Halloween event. It is saved to your account.')
      +card(2,'🚪','Where is the pass?','Open Itsukis Chat and tap the Halloween Pass banner, or use Settings → Open Halloween Pass.')
      +card(3,'🔔','Rewards ready','An orange number on the Itsukis Chat button tells you how many rewards are waiting to be claimed.')
      +card(4,'🐌','Laggy device?','Turn on Anti-lag in Settings to calm the animations.'),
    '<div class="hwi-ring hwi-in"><span>🕯️</span></div><div class="hwi-h hwi-in" style="--n:1">Your clock is ticking</div>'
      +'<div class="hwi-p hwi-in" style="--n:2">You are all set. Keep the tab open, stay active and come back to claim your rewards. You can reopen this guide any time with the <b>?</b> button at the top left of the pass.</div>'
      +'<div class="hwi-chips hwi-in" style="--n:3"><span class="hwi-chip">⭐ You are on level '+lv+' of '+HW.N+'</span></div>'
  ];
  const r=(a,b)=>(a+Math.random()*(b-a)).toFixed(1);let fx='';
  for(let i=0;i<22;i++)fx+='<i style="--x:'+r(2,98)+'%;--s:'+r(2,5)+'px;--dx:'+r(-70,70)+'px;--d:'+r(6,12)+'s;--t:-'+r(0,10)+'s"></i>';
  for(let i=0;i<4;i++)fx+='<b style="--y:'+r(4,60)+'%;--z:'+r(16,26)+'px;--dy:'+r(-40,40)+'px;--d:'+r(11,19)+'s;--t:-'+r(0,14)+'s">🦇</b>';
  const el=document.createElement('div');el.className='hwi';el.id='hwi';el.setAttribute('role','dialog');el.setAttribute('aria-label','Halloween Pass guide');
  el.innerHTML='<div class="hwi-fx" aria-hidden="true">'+fx+'</div><button class="hwi-skip" id="hwiSkip" type="button">'+(replay?'Close':'Skip')+'</button>'
    +'<div class="hwi-stage">'+slides.map((h,i)=>'<section class="hwi-s'+(i?'':' on')+'"><div class="hwi-c">'+h+'</div></section>').join('')+'</div>'
    +'<div class="hwi-nav"><button class="hwi-b sec v" id="hwiBack" type="button">Back</button><div class="hwi-dots">'+slides.map((_,i)=>'<button type="button" data-i="'+i+'" aria-label="Page '+(i+1)+'"'+(i?'':' class="on"')+'></button>').join('')+'</div><button class="hwi-b" id="hwiNext" type="button">Next</button></div>';
  modal.style.minHeight=Math.min(600,Math.round(innerHeight*.9))+'px';   // the guide fills the pass window, so keep it tall enough even if the reward list is short
  modal.appendChild(el);
  hwBurst();
  let cur=0;const ss=[...el.querySelectorAll('.hwi-s')],dots=[...el.querySelectorAll('.hwi-dots button')],nx=el.querySelector('#hwiNext'),bk=el.querySelector('#hwiBack');
  const go=i=>{
    i=Math.max(0,Math.min(slides.length-1,i));if(i===cur)return;
    ss.forEach((x,k)=>{x.classList.toggle('on',k===i);x.classList.toggle('prev',k<i)});
    dots.forEach((d,k)=>d.classList.toggle('on',k===i));
    cur=i;bk.classList.toggle('v',i===0);nx.textContent=i===slides.length-1?(replay?'Done':'Let\'s go! 🎃'):'Next';
  };
  const key=e=>{
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();fin(false)}
    else if(e.key==='ArrowRight'||e.key==='Enter'){e.stopPropagation();e.preventDefault();nx.click()}
    else if(e.key==='ArrowLeft'){e.stopPropagation();go(cur-1)}
  };
  document.addEventListener('keydown',key,true);
  function fin(celebrate){
    document.removeEventListener('keydown',key,true);
    if(!replay)hwIntroMark();
    if(celebrate)hwBurst();
    el.classList.add('out');setTimeout(()=>{el.remove();_hwiOpen=false;modal.style.minHeight=''},300);
  }
  nx.onclick=()=>{if(cur===slides.length-1)fin(true);else go(cur+1)};
  bk.onclick=()=>go(cur-1);
  el.querySelector('#hwiSkip').onclick=()=>fin(false);
  dots.forEach(d=>d.onclick=()=>go(+d.dataset.i));
  nx.focus({preventScroll:true});
}
/* ---------- time tracking: +1 minute per minute genuinely online (logged in and connected; no activity needed) ---------- */
let _hwBusy=false;
setInterval(async()=>{
  if(_hwBusy||!ME||!window.HW_LOADED||!hwOpen()||navigator.onLine===false)return;   // online is enough: no activity or visible-tab check, so AFK farming works
  const p=window.HW_PROG||{};
  if(hwNow()-(Number(p.last)||0)<56000)return;   // background tabs are throttled to ~1 tick/min, so stay a little under the server's 55 s minimum gap's safety margin
  _hwBusy=true;
  try{await set(ref(rtdb,'halloween/progress/'+ME.id),{mins:(Number(p.mins)||0)+1,last:serverTimestamp()})}
  catch(e){console.warn('halloween progress not saved',e)}
  finally{_hwBusy=false}
},15000);
/* ---------- wiring: chat picker hero, settings card, refresh (nothing here touches layout outside the picker/settings) ---------- */
function hwSync(){
  try{if(ME&&window.HW_CLAIMED){if(hwForever(ME.id))localStorage.setItem('ich.hwForever',String(ME.id));else if(localStorage.getItem('ich.hwForever')===String(ME.id))localStorage.removeItem('ich.hwForever')}}catch(_){}
  hwDeco(hwThemeAvail()&&hwWant());
  hwEnsureCss();
  const gg=document.getElementById('goGlobal');
  if(gg){
    const n=(ME&&hwCanClaim())?hwClaimable():0;let d=gg.querySelector('.hw-dot');
    if(n&&!d){d=document.createElement('span');d.className='hw-dot';gg.appendChild(d)}
    if(d){if(n)d.textContent=n;else d.remove()}
  }
}
function hwRefresh(){hwSync();hwRender();hwHeroRefresh()}
window.hwRefresh=hwRefresh;
setInterval(hwSync,3000);hwSync();
function hwHeroRefresh(){
  const h=document.querySelector('#gcBg .hw-hero');if(!h||!ME)return;
  const{lvl,m}=hwProg(),n=hwClaimable();
  const pct=lvl>=HW.N?100:Math.min(100,Math.round((m-hwCum(lvl))/(hwCum(lvl+1)-hwCum(lvl))*100));
  h.querySelector('.hw-hero-s').textContent=(lvl>=HW.N?'Max level reached':'Level '+lvl+' of '+HW.N)+(n?' · '+n+' reward'+(n>1?'s':'')+' ready':' · '+(m/60).toFixed(1)+'h online');
  h.querySelector('.hw-hero-bar i').style.setProperty('--p',pct+'%');
  const go=h.querySelector('.hw-hero-go');let b=go.querySelector('b');
  if(n&&!b){b=document.createElement('b');go.appendChild(b)}if(b){if(n)b.textContent=n;else b.remove()}
}
function hwPickerInject(){
  if(!ME||!hwCanClaim())return;
  const g=document.querySelector('#gcBg .gc-grid');if(!g||g.querySelector('.hw-hero'))return;
  const r=(a,b)=>(a+Math.random()*(b-a)).toFixed(1);let sp='';
  for(let i=0;i<9;i++)sp+='<i style="--x:'+r(4,94)+'%;--s:'+r(2,4)+'px;--dx:'+r(-20,20)+'px;--d:'+r(3,6)+'s;--t:-'+r(0,6)+'s"></i>';
  const el=document.createElement('button');el.type='button';el.className='hw-hero';el.id='gcHalloween';
  el.innerHTML='<span class="hw-hero-ring"></span><span class="hw-hero-sp" aria-hidden="true">'+sp+'</span><span class="hw-hero-ic">🎃</span><span class="hw-hero-copy"><span class="hw-hero-t">Halloween Pass</span><span class="hw-hero-s"></span><span class="hw-hero-bar"><i></i></span></span><span class="hw-hero-go">Open Pass</span>';
  const v=g.querySelector('.vip-hero');if(v)v.insertAdjacentElement('afterend',el);else g.insertAdjacentElement('afterbegin',el);
  el.onclick=()=>{const bg=document.getElementById('gcBg');if(bg)bg.classList.add('closing');setTimeout(()=>{const mr=document.getElementById('modalRoot');if(mr)mr.innerHTML='';hwModal()},240)};
  hwHeroRefresh();
}
{const o=modalGlobalChoice;modalGlobalChoice=function(){const x=o.apply(this,arguments);try{hwPickerInject()}catch(e){console.warn('halloween picker',e)}return x}}
function hwSettingsInject(){
  const a=document.getElementById('sAntiLag');
  if(!a||document.getElementById('sHwOpen')||!(hwCanClaim()||hwThemeAvail()))return;
  const c=a.closest('.set-card');if(!c)return;
  c.insertAdjacentHTML('afterend','<div class="set-card"><div class="section-h" style="margin-top:0">🎃 Halloween event</div>'+(hwThemeAvail()?'<div class="toggle-row" style="margin-bottom:0"><div><div style="font-weight:600;font-size:14px">Halloween theme</div><div class="hint" style="margin-top:2px">Spooky decorations (bats, ghosts, fog, cobwebs) and the orange/purple look across the app. Turn off for the normal look. Your Halloween roles and name effects stay either way. Saved to your account.</div></div><label class="switch"><input type="checkbox" id="sHwTheme" '+(hwWant()?'checked':'')+'><span class="slider"></span></label></div>':'<div class="hint" style="margin-bottom:0">The Halloween theme has ended. Only players who finished all 30 levels of the pass keep it. Your Halloween roles and name effects stay.</div>')+'<button class="btn" id="sHwOpen" type="button" style="margin-top:12px;width:100%">🎃 Open Halloween Pass</button><button class="btn sec" id="sHwCos" type="button" style="margin-top:8px;width:100%">✨ Customize name, title &amp; badge</button></div>');
  const _ht=document.getElementById('sHwTheme');if(_ht)_ht.addEventListener('change',e=>hwSetTheme(e.target.checked,e.target));
  document.getElementById('sHwOpen').onclick=hwModal;
  document.getElementById('sHwCos').onclick=openCosmetics;
}
{const o=openSettings;openSettings=function(){const x=o.apply(this,arguments);try{hwSettingsInject();setTimeout(hwSettingsInject,250)}catch(e){console.warn('halloween settings',e)}return x}}

/* ---------- Cosmetics: choose how your name looks (sections; for now just "Halloween 2026") ---------- */
const CS_SECTIONS=[{id:'hw2026',name:'Halloween 2026',emoji:'🎃'}];   // add future events here: {id,name,emoji} + a case in csBody()
let _csSec='hw2026';
async function csEquip(key,val){   // val: 'auto' | 0 (none) | level number
  if(!ME)return;
  const id=ME.id,cur={...((window.HW_EQ||{})[id]||{})};
  if(val==='auto')delete cur[key];else cur[key]=val;
  for(const k of Object.keys(cur))if(!['fx','title','badge'].includes(k))delete cur[k];
  const prev=(window.HW_EQ||{})[id];
  window.HW_EQ={...(window.HW_EQ||{}),[id]:Object.keys(cur).length?cur:undefined};
  if(!Object.keys(cur).length)delete window.HW_EQ[id];
  csRender();try{if(typeof renderChatLight==='function')renderChatLight()}catch(_){}
  try{
    if(Object.keys(cur).length)await set(ref(rtdb,'halloween/equipped/'+id),cur);
    else await remove(ref(rtdb,'halloween/equipped/'+id));
  }catch(e){
    console.warn('cosmetics save failed',e);
    window.HW_EQ={...(window.HW_EQ||{})};if(prev)window.HW_EQ[id]=prev;else delete window.HW_EQ[id];
    csRender();
    toast(e&&e.code==='PERMISSION_DENIED'?'Could not save: publish the updated database rules (halloween/equipped).':'Could not save that choice.','bad');
  }
}
function csOptHTML(key,val,icon,label,sub,on){
  return '<button type="button" class="cs-opt'+(on?' on':'')+'" aria-pressed="'+(on?'true':'false')+'" data-k="'+key+'" data-v="'+val+'"><span class="ci">'+icon+'</span><span class="ct"><span>'+label+'</span>'+(sub?'<em>'+sub+'</em>':'')+'</span></button>';
}
function csHwBody(){
  const id=ME.id,L=hwLevel(id),eq=(window.HW_EQ||{})[id]||{};
  const cur=k=>(eq[k]===undefined||eq[k]===null)?'auto':Math.floor(Number(eq[k]));
  const owned=kinds=>HW_R.map((r,i)=>({r,L:i+1})).filter(x=>x.L<=L&&kinds.indexOf(x.r[2])>-1);
  const sec=(key,title,kinds,render,autoSub,emptyTxt)=>{
    const list=owned(kinds),c=cur(key);
    let h='<div class="cs-h">'+title+'<span>'+list.length+' unlocked</span></div>';
    if(!list.length)return h+'<div class="cs-empty">'+emptyTxt+'</div>';
    h+='<div class="cs-grid">'+csOptHTML(key,'auto','✨','Auto',autoSub,c==='auto')+csOptHTML(key,0,'🚫','None','Hide it',c===0)
      +list.map(x=>render(x.r,x.L,c===x.L)).join('')+'</div>';
    return h;
  };
  if(!L)return '<div class="cs-empty" style="padding:18px 0">You haven\'t unlocked any Halloween rewards yet. Earn levels on the Halloween Pass, then come back here to pick how your name looks.</div>';
  return sec('fx','Name effect',['n','t'],(r,lv,on)=>csOptHTML('fx',lv,r[0],'<span class="hw-name hw-plain hw-s-'+r[3]+'">'+r[1]+'</span>','Level '+lv,on),'Best one you own','Reach level 5 for your first name effect.')
    +sec('title','Title',['t'],(r,lv,on)=>csOptHTML('title',lv,r[0],'<span class="hw-title hw-t-'+r[3]+'" style="margin:0">'+r[0]+' '+r[1].split(' ').pop()+'</span>','Level '+lv,on),'Best one you own','Reach level 19 for your first title.')
    +sec('badge','Badge emoji',['b'],(r,lv,on)=>csOptHTML('badge',lv,r[0],r[1],'Level '+lv,on),'Latest one you unlocked','Reach level 1 to get a badge.');
}
function csBody(){
  const s=_csSec;
  if(s==='hw2026')return csHwBody();
  return '';
}
function csRender(){
  const bg=document.getElementById('csBg');if(!bg||!ME)return;
  const nm=displayUsername(ME.username);
  const hasEq=!!((window.HW_EQ||{})[ME.id]);
  bg.querySelector('.cs-prev').innerHTML=avatarHtml(ME,nm,'width:46px;height:46px;font-size:18px;flex:none')+'<div class="cs-pn">'+fullNameHTML(ME.id,esc(nm))+'<small>This is how your name looks to everyone</small></div>';
  bg.querySelector('.cs-secs').innerHTML=CS_SECTIONS.map(s=>'<button type="button" data-s="'+s.id+'" class="'+(s.id===_csSec?'on':'')+'">'+s.emoji+' '+s.name+'</button>').join('');
  const body=bg.querySelector('.cs-body'),y=body.scrollTop;
  body.innerHTML=csBody();body.scrollTop=y;
  const rs=bg.querySelector('#csReset');if(rs)rs.disabled=!hasEq;
}
function openCosmetics(){
  ME=DB.currentUser();if(!ME)return;
  const root=document.getElementById('modalRoot');if(!root)return;
  root.innerHTML='<div class="modal-bg" id="csBg"><div class="modal cs-modal" role="dialog" aria-modal="true" aria-label="Cosmetics"><button class="cs-x" id="csX" type="button" aria-label="Close">✕</button>'
    +'<div class="cs-top"><h2>✨ Cosmetics</h2><div class="cs-prev"></div></div><div class="cs-secs"></div><div class="cs-body"></div>'
    +'<div class="cs-foot"><button class="btn sec" id="csReset" type="button">Reset to auto</button><button class="btn" id="csDone" type="button">Done</button></div></div></div>';
  const close=()=>{const bg=document.getElementById('csBg');if(!bg)return;bg.classList.add('closing');setTimeout(()=>{if(document.getElementById('csBg'))root.innerHTML=''},200)};
  const bg=document.getElementById('csBg');
  bg.onclick=e=>{
    if(e.target===bg){close();return}
    const o=e.target.closest('.cs-opt');if(o){const v=o.dataset.v;csEquip(o.dataset.k,v==='auto'?'auto':Number(v));return}
    const s=e.target.closest('.cs-secs button');if(s){_csSec=s.dataset.s;csRender()}
  };
  document.getElementById('csX').onclick=close;document.getElementById('csDone').onclick=close;
  document.getElementById('csReset').onclick=async()=>{
    const id=ME.id;const prev=(window.HW_EQ||{})[id];
    const m={...(window.HW_EQ||{})};delete m[id];window.HW_EQ=m;csRender();
    try{await remove(ref(rtdb,'halloween/equipped/'+id));toast('Back to auto.')}
    catch(e){window.HW_EQ={...(window.HW_EQ||{}),[id]:prev};csRender();toast('Could not reset.','bad')}
  };
  csRender();
}
function csInjectAccount(){
  const root=document.getElementById('modalRoot');if(!root||!ME||document.getElementById('acCosmetics'))return;
  const hs=[...root.querySelectorAll('.section-h')].find(x=>x.textContent.trim()==='Session');if(!hs)return;
  hs.insertAdjacentHTML('beforebegin','<div class="section-h">✨ Cosmetics</div><div class="hint" style="margin-bottom:10px">Choose your name effect, title and badge from the events you\'ve unlocked.</div><button class="btn sec" style="width:100%" id="acCosmetics" type="button">✨ Customize my name</button>');
  document.getElementById('acCosmetics').onclick=openCosmetics;
}
{const o=openAccount;openAccount=function(){const x=o.apply(this,arguments);try{csInjectAccount()}catch(e){console.warn('cosmetics account',e)}return x}}
/* HALLOWEEN:END */
