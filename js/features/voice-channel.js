/* Voice Channel — Agora RTC (audio only) + Firebase RTDB presence/moderation.
   Self-contained: loaded last (STATIC_LATE in index.html), never touches other modules.
   Optional overrides before this file runs: window.VC_CONFIG, window.VC_FIREBASE_VERSION, window.VC_ADAPTER.

   v2 (2026-10-07): token support (TOKEN_URL), staged join with progress, SDK/token preloading,
   clearer errors, presence self-heal, live speaking levels, connection quality, shortcuts (M / D),
   animated tiles. Token server: worker/agora-token-worker.js  (setup: VOICE-SETUP.md).
   v2.1 (2026-10-08): join can no longer hang or leak (per-step timeouts, working Cancel, hard cleanup that always
   leaves the Agora channel + closes the mic), minutes counted only after 60s connected, presence written only after a
   real connection, event log in "Copy details", built-in connection test (__vcTest()). */
(function(){
'use strict';
if(window.__vcLoaded)return;window.__vcLoaded=1;

var CFG=Object.assign({
  APP_ID:'f37940cb3900495d99a1a5c511db076f',   // App ID is public. NEVER put the App Certificate in this file.
  CHANNEL:'itsukis-hub-voice',
  /* Token server (Cloudflare Worker, see worker/agora-token-worker.js). Leave '' while your Agora project is in
     "App ID" (testing) mode; REQUIRED once the App Certificate is enabled, e.g. 'https://agora-token.YOURNAME.workers.dev' */
  TOKEN_URL:'https://agora-token.jace01b.workers.dev',
  TOKEN_CACHE_MS:20*60e3,
  SDK_TIMEOUT_MS:15e3,       // loading the Agora library
  JOIN_TIMEOUT_MS:15e3,      // Agora gateway handshake
  PUBLISH_TIMEOUT_MS:12e3,   // audio connection (WebRTC/UDP) - the usual place a VPN/firewall/blocker causes a hang
  GUARD_MS:45e3,             // absolute cap on the connect phase; past this everything is torn down
  SLOW_HINT_MS:6e3,          // show the "taking longer than usual" hint after this long
  MONTH_LIMIT:10000,         // Agora free minutes per month
  MAX_USERS:12,              // client-side cap (protects your 10,000 free minutes)
  ALONE_MS:3*60e3,           // leave automatically if you're alone this long
  IDLE_MS:30*60e3,           // leave if no input + not speaking this long (AFK)
  HEARTBEAT_MS:30e3,
  HIDE_STALE_MS:90e3,        // hide roster entries not refreshed for this long
  PRUNE_STALE_MS:150e3,      // delete ghost entries (must match database rules)
  FORCE_MUTE_MS:30*60e3,
  SDK_URLS:['https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4/AgoraRTC_N-production.js','https://download.agora.io/sdk/release/AgoraRTC_N-4.23.4.js'],
  FB_VERSIONS:['12.4.0','11.10.0','10.14.1','10.12.5','10.7.1','9.23.0']
},window.VC_CONFIG||{});

var $=function(i){return document.getElementById(i)};
var noop=function(){};
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
function h(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function now(){return Date.now()}

var I={
 mic:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
 micOff:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
 head:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"/></svg>',
 headOff:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"/><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
 leave:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 9c-3.2 0-6.2.9-8.6 2.6-.5.4-.7 1-.5 1.6l.9 2.3c.2.6.9.9 1.5.7l2.7-1c.5-.2.8-.6.8-1.1V12c.9-.3 1.8-.5 2.8-.5h.8c1 0 1.9.2 2.8.5v1.1c0 .5.3.9.8 1.1l2.7 1c.6.2 1.3-.1 1.5-.7l.9-2.3c.2-.6 0-1.2-.5-1.6C18.2 9.9 15.2 9 12 9z"/></svg>',
 vol:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
 spk:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
 warn:'<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2.5 1.8 20.5A1.2 1.2 0 0 0 2.8 22.3h18.4a1.2 1.2 0 0 0 1-1.8L12 2.5zm1 14.5h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg>',
 retry:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z"/></svg>',
 copy:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
 check:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};

var S={fb:null,me:null,members:{},forceMap:{},owners:{},mods:{},admins:{},secret:false,voiceOn:true,banned:false,
  users:{},userReq:{},tiles:{},unsub:[],sess:[],timers:{},
  client:null,track:null,micErr:false,micMsg:'',sid:'',mref:null,joined:false,joining:false,gen:0,joinAt:0,
  stage:'',slow:false,log:[],err:null,tok:null,q:0,heals:[],healing:false,
  mutedLocal:false,deaf:false,wasMuted:false,remote:{},speaking:{},level:{},vol:{},localMute:{},
  lastActive:now(),aloneSince:0,open:false,sbEl:null,view:null,dock:null,prevIds:null,prunedAt:{},reconnecting:false,usage:{},usageMonth:'',usageUn:null};

/* ---------- event log (shown in "Copy details" so problems can be diagnosed) + timeouts ---------- */
var T0=now();
var released=typeof WeakSet==='function'?new WeakSet():null;   // mic tracks / Agora clients that cleanup() already closed
function markReleased(o){try{if(released&&o)released.add(o)}catch(e){}}
function isReleased(o){return !!(released&&released.has(o))}
function dbg(m){var l=S.log;l.push('+'+((now()-T0)/1000).toFixed(1)+'s '+m);if(l.length>60)l.shift();try{console.debug('[voice]',m)}catch(e){}}
function withTimeout(p,ms,code,msg){
  var to;
  return Promise.race([Promise.resolve(p),new Promise(function(_,rej){to=setTimeout(function(){rej(Object.assign(new Error(msg||code),{code:code}))},ms)})])
    .then(function(v){clearTimeout(to);return v},function(e){clearTimeout(to);throw e});
}

/* ---------- toast + sounds ---------- */
function toast(msg){
  var w=$('vcToasts');if(!w){w=h('div','vc-toasts');w.id='vcToasts';w.setAttribute('role','status');w.setAttribute('aria-live','polite');document.body.appendChild(w)}
  var t=h('div','vc-toast',msg);w.appendChild(t);
  setTimeout(function(){t.classList.add('out');setTimeout(function(){t.remove()},320)},4200);
}
var AC;
function beep(a,b){try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();var o=AC.createOscillator(),g=AC.createGain(),t=AC.currentTime;
  o.type='sine';o.frequency.setValueAtTime(a,t);o.frequency.setValueAtTime(b,t+.09);g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(.1,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.22);o.connect(g);g.connect(AC.destination);o.start();o.stop(t+.24)}catch(e){}}

/* ---------- Firebase (shares the site's own initialised app) ---------- */
async function fbInit(){
  if(S.fb)return S.fb;
  if(window.VC_ADAPTER){S.fb=window.VC_ADAPTER;return S.fb}
  var vs=[],seen={};function add(v){if(v&&!seen[v]){seen[v]=1;vs.push(v)}}
  add(window.VC_FIREBASE_VERSION);
  try{performance.getEntriesByType('resource').forEach(function(e){var m=/firebasejs\/(\d+\.\d+\.\d+)\//.exec(e.name);if(m)add(m[1])})}catch(e){}
  try{add(localStorage.getItem('vcFbVer'))}catch(e){}
  CFG.FB_VERSIONS.forEach(add);
  for(var i=0;i<vs.length;i++){
    var base='https://www.gstatic.com/firebasejs/'+vs[i]+'/';
    try{
      var A=await import(base+'firebase-app.js'),apps=A.getApps();if(!apps.length)continue;
      var D=await import(base+'firebase-database.js'),U=await import(base+'firebase-auth.js');
      S.fb={db:D.getDatabase(apps[0]),auth:U.getAuth(apps[0]),onAuth:U.onAuthStateChanged,F:D};
      try{localStorage.setItem('vcFbVer',vs[i])}catch(e){}
      return S.fb;
    }catch(e){}
  }
  return null;
}
function R(p){return S.fb.F.ref(S.fb.db,p)}
function watch(p,cb,bucket){
  var un=S.fb.F.onValue(R(p),function(s){cb(s.val())},noop);(bucket||S.unsub).push(un);return un;
}
function bindAuth(fb){
  if(S.authBound)return;S.authBound=true;
  fb.onAuth(fb.auth,function(u){if(u)bindUser(u);else unbindUser()});
}
async function ensureReady(){
  var fb=await fbInit();if(!fb)return false;
  bindAuth(fb);
  for(var i=0;i<30&&!S.me;i++)await sleep(200);
  return !!S.me;
}
async function fbBoot(n){
  var fb=await fbInit();
  if(fb){bindAuth(fb);return}
  if(n<6)setTimeout(function(){fbBoot(n+1)},[1500,3000,5000,8000,12000,20000][n]);
}
async function bindUser(u){
  unbindUser(true);
  var id=null;
  for(var k=0;k<10&&id==null;k++){try{var s=await S.fb.F.get(R('uidToId/'+u.uid));if(s.exists())id=s.val()}catch(e){}if(id==null)await sleep(1000)}
  if(id==null||!S.fb.auth.currentUser||S.fb.auth.currentUser.uid!==u.uid)return;
  S.me={id:String(id),uid:u.uid};
  watch('voice/members',function(v){S.members=v&&typeof v==='object'?v:{};rosterChanged()});
  watch('voice/forceMuted',function(v){S.forceMap=v||{};applyForce();applyPlayback();render()});
  watch('owners',function(v){S.owners=v||{};render()});
  watch('mods',function(v){S.mods=v||{};render()});
  watch('admin',function(v){S.admins=v||{};render()});
  watch('secretowner/'+S.me.id,function(v){S.secret=v===1;render()});
  watch('modSettings/voiceEnabled',function(v){S.voiceOn=v!==false;if(!S.voiceOn&&(S.joined||S.joining))cleanup('Voice was turned off by an owner.');render()});
  watch('banned/'+S.me.id,function(v){S.banned=v===true;if(S.banned&&S.joined)cleanup('You are banned.');render()});
  bindUsage();userOf(S.me.id);render();
  preloadSoon();
}
function unbindUser(keep){
  if(!keep&&(S.joined||S.joining))cleanup('');
  S.unsub.forEach(function(f){try{f()}catch(e){}});S.unsub=[];S.usageUn=null;S.usageMonth='';S.usage={};
  if(!keep){S.me=null;S.members={};S.tok=null;S.err=null;render()}
}

/* ---------- users / roles ---------- */
function userOf(id){
  var u=S.users[id];
  if(!u){u=S.users[id]={name:'User '+id,avatar:'',t:0}}
  if(S.fb&&!S.userReq[id]){S.userReq[id]=1;
    S.fb.F.get(R('users/'+id)).then(function(s){var v=s.val()||{};
      S.users[id]={name:v.username||('User '+id),avatar:(v.style&&v.style.avatar)||'',t:now()};render()}).catch(function(){setTimeout(function(){delete S.userReq[id]},15000)});}
  return u;
}
function isOwnerId(id){return S.owners[id]===1}
function iAmOwner(){return !!S.me&&(S.secret||isOwnerId(S.me.id))}
function iAmMod(){return !!S.me&&S.mods[S.me.id]===1}
function iAmAdmin(){return !!S.me&&S.admins[S.me.id]===1}
function canMod(t){
  if(!S.me||t===S.me.id)return false;
  if(iAmOwner())return !isOwnerId(t);
  if(iAmAdmin())return !isOwnerId(t)&&S.admins[t]!==1;
  if(iAmMod())return !isOwnerId(t)&&S.mods[t]!==1&&S.admins[t]!==1;
  return false;
}
function isForced(id){var f=S.forceMap[id];return !!(f&&typeof f.until==='number'&&f.until>now())}
function hueOf(s){var x=0;for(var i=0;i<s.length;i++)x=(x*31+s.charCodeAt(i))>>>0;return x%360}
function colorOf(s){return 'hsl('+hueOf(s)+',55%,45%)'}
function fmtTime(ms){var s=Math.max(0,Math.floor(ms/1000)),m=Math.floor(s/60),hh=Math.floor(m/60);s%=60;m%=60;
  return hh?hh+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s:m+':'+(s<10?'0':'')+s}

/* ---------- monthly minutes (estimate counted by clients, UTC months) ---------- */
function monthKey(){var d=new Date();return String(d.getUTCFullYear()*100+d.getUTCMonth()+1)}
function usageTotal(u){var t=0;Object.keys(u||{}).forEach(function(k){var m=u[k]&&u[k].mins;if(typeof m==='number')t+=m});return t}
function bindUsage(){
  var mk=monthKey();if(S.usageMonth===mk&&S.usageUn)return;
  if(S.usageUn){try{S.usageUn()}catch(e){}}
  S.usageMonth=mk;S.usage={};
  S.usageUn=watch('voice/usage/'+mk,function(v){S.usage=v||{};renderUsage()});
}
function countMinute(){
  if(!S.joined||!S.me)return;bindUsage();
  var cur=S.usage[S.me.id],n=((cur&&cur.mins)||0)+1;
  S.fb.F.set(R('voice/usage/'+S.usageMonth+'/'+S.me.id),{mins:n,last:S.fb.F.serverTimestamp()}).catch(noop);
}
function renderUsage(){
  var b=$('vcUsage');if(!b)return;
  var t=usageTotal(S.usage),L=CFG.MONTH_LIMIT,p=Math.min(100,t/L*100);
  b.textContent='📊 '+t.toLocaleString()+' / '+L.toLocaleString()+' min this month';
  b.className='vc-usage'+(p>=95?' red':(p>=80?' warn':''));b.style.setProperty('--p',p+'%');
}
async function showUsage(e){
  e.stopPropagation();closePop();
  var p=h('div','vc-pop vc-usage-pop');p.id='vcPop';p.addEventListener('click',function(ev){ev.stopPropagation()});
  p.appendChild(h('div','vc-pop-h','Voice minutes used'));
  var body=h('div','vc-us-list','Loading…');p.appendChild(body);S.view.appendChild(p);
  try{
    var snap=await S.fb.F.get(R('voice/usage')),all=snap.val()||{},ks=Object.keys(all).sort().reverse();
    body.textContent='';
    ks.forEach(function(k){
      var t=usageTotal(all[k]),row=h('div','vc-us-row'),y=+k.slice(0,4),m=+k.slice(4);
      var lab=new Date(Date.UTC(y,m-1,1)).toLocaleString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
      row.appendChild(h('span','vc-us-m',lab));row.appendChild(h('span','vc-us-v',t.toLocaleString()+' min'));
      var bar=h('div','vc-us-bar'),f=h('i');f.style.width=Math.min(100,t/CFG.MONTH_LIMIT*100)+'%';bar.appendChild(f);row.appendChild(bar);body.appendChild(row);
    });
    if(!ks.length)body.textContent='No usage recorded yet.';
    body.appendChild(h('div','vc-us-note','Counted by clients: 1 minute per connected person per minute (UTC months). Agora\'s console is the source of truth.'));
  }catch(err){body.textContent='Couldn\'t load usage.'}
}

/* ---------- roster ---------- */
function activeList(){
  var t=now(),out=[];
  Object.keys(S.members||{}).forEach(function(id){
    var m=S.members[id];if(!m||typeof m!=='object')return;
    var mine=S.me&&id===S.me.id&&S.joined;
    if(!mine&&(m.seen||0)<t-CFG.HIDE_STALE_MS)return;
    out.push({id:id,at:m.at||0,muted:!!m.muted,deaf:!!m.deaf});
  });
  out.sort(function(a,b){return a.at-b.at});return out;
}
function rosterChanged(){
  var list=activeList(),ids={};list.forEach(function(m){ids[m.id]=1});
  if(S.prevIds&&S.joined){
    var j=0,l=0;Object.keys(ids).forEach(function(i){if(!S.prevIds[i])j++});Object.keys(S.prevIds).forEach(function(i){if(!ids[i])l++});
    if(j&&!l)beep(520,780);else if(l&&!j)beep(780,420);
  }
  S.prevIds=ids;
  render();pruneGhosts();
}
function pruneGhosts(){
  if(!S.fb||!S.me)return;var t=now();
  Object.keys(S.members||{}).forEach(function(id){
    var m=S.members[id];if(!m||id===S.me.id)return;
    if((m.seen||0)<t-CFG.PRUNE_STALE_MS&&(S.prunedAt[id]||0)<t-60e3){S.prunedAt[id]=t;S.fb.F.remove(R('voice/members/'+id)).catch(noop)}
  });
}

/* ---------- Agora SDK (preloaded while you browse, so joining is instant) ---------- */
var sdkP=null;
function loadSdk(){
  if(window.AgoraRTC)return Promise.resolve();
  if(sdkP)return sdkP;
  sdkP=(async function(){
    for(var i=0;i<CFG.SDK_URLS.length;i++){
      try{await new Promise(function(res,rej){var s=document.createElement('script');s.async=true;s.src=CFG.SDK_URLS[i];s.onload=res;s.onerror=function(){s.remove();rej()};document.head.appendChild(s)});
        if(window.AgoraRTC){
          try{AgoraRTC.setLogLevel(3);AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL',200)}catch(e){}
          try{AgoraRTC.disableLogUpload()}catch(e){}   // fewer third-party requests for blockers to choke on
          try{AgoraRTC.onAutoplayFailed=function(){toast('Tap anywhere to turn on voice audio.');document.addEventListener('pointerdown',function f(){document.removeEventListener('pointerdown',f,true);applyPlayback()},true)}}catch(e){}
          try{AgoraRTC.onMicrophoneChanged=onMicChanged}catch(e){}
          return}}catch(e){}
    }
    sdkP=null;throw Object.assign(new Error('Could not load the Agora SDK (blocked by network or an ad-blocker?)'),{code:'SDK_LOAD'});
  })();
  return sdkP;
}
var preloadT=0;
function preloadSoon(){
  if(preloadT||window.AgoraRTC)return;
  var go=function(){loadSdk().catch(noop)};
  preloadT=1;
  if(window.requestIdleCallback)requestIdleCallback(go,{timeout:5000});else setTimeout(go,2500);
}
function warm(){loadSdk().catch(noop);if(S.me&&CFG.TOKEN_URL)fetchToken().catch(noop)}

/* ---------- token ---------- */
function tokErr(code,msg,status){return Object.assign(new Error(msg),{code:code,status:status})}
async function fetchToken(force){
  if(!CFG.TOKEN_URL)return null;
  if(!force&&S.tok&&now()-S.tok.at<CFG.TOKEN_CACHE_MS)return S.tok.v;
  var u=S.fb&&S.fb.auth.currentUser;if(!u||!S.me)throw tokErr('TOKEN_AUTH','You need to be signed in.');
  var idt=await u.getIdToken();
  var url=CFG.TOKEN_URL+(CFG.TOKEN_URL.indexOf('?')<0?'?':'&')+'channel='+encodeURIComponent(CFG.CHANNEL)+'&uid='+encodeURIComponent(S.me.id);
  var ctl=window.AbortController?new AbortController():null,to=setTimeout(function(){if(ctl)ctl.abort()},10000),r;
  try{r=await fetch(url,{headers:{Authorization:'Bearer '+idt},signal:ctl?ctl.signal:undefined,cache:'no-store'})}
  catch(e){throw tokErr('TOKEN_SERVER','Couldn\'t reach the voice token server (an ad-blocker/VPN may be blocking it, or the Worker URL is wrong).')}
  finally{clearTimeout(to)}
  var j=null;try{j=await r.json()}catch(e){}
  if(!r.ok||!j||!j.token)throw tokErr(r.status===403?'TOKEN_DENIED':'TOKEN_SERVER',(j&&j.error)||('Token server returned '+r.status),r.status);
  S.tok={v:j.token,at:now()};return j.token;
}
async function renewToken(){
  if(!S.client||!CFG.TOKEN_URL)return;
  try{var t=await fetchToken(true);await S.client.renewToken(t)}
  catch(e){setTimeout(function(){if(S.joined)renewToken()},15000)}
}

/* ---------- friendly errors ---------- */
function explain(e){
  var code=String((e&&(e.code||e.name))||''),raw=String((e&&e.message)||e||''),all=code+' '+raw,o={code:code||'ERROR',raw:raw,retry:true};
  var own=iAmOwner();
  var BLOCK='Something on your device or network is blocking the voice connection. Turn off ad/tracker blockers for this site (Opera GX: the shield icon in the address bar), pause any VPN or proxy, and make sure nothing blocks UDP/WebRTC. Then try again. Voice does not work on school Chromebooks or managed school networks.';
  if(/invalid vendor key|INVALID_VENDOR_KEY|can not find appid/i.test(all)){
    o.title='Wrong Agora App ID';o.msg=own?'Agora doesn\'t recognise the App ID in voice-channel.js. Copy it again from the Agora Console (it is all lowercase).':'Voice isn\'t set up correctly yet. Please tell an owner.';o.retry=false;
  }else if(/dynamic use static key/i.test(all)){
    o.title=own?'Voice needs a token':'Voice isn\'t ready yet';
    o.msg=own?(CFG.TOKEN_URL?'Agora got no usable token even though TOKEN_URL is set. Reload the page and retry.':'Your Agora project has the App Certificate turned on, but no token server is configured. Either switch the project to "App ID" mode in the Agora Console, or deploy worker/agora-token-worker.js and set TOKEN_URL (see VOICE-SETUP.md).'):'The owner still has to finish setting up voice. Try again later.';o.retry=!!own;
  }else if(/invalid token|token.*(expire|invalid|fail)|authorized failed|DYNAMIC_KEY|TOKEN_EXPIRED/i.test(all)&&!/^TOKEN_(SERVER|DENIED|AUTH)$/.test(code)){
    o.title='Voice token was rejected';o.msg=own?'The token server answered, but Agora refused the token. Check that AGORA_APP_ID and AGORA_APP_CERTIFICATE in the Worker belong to this same project, and that CHANNEL matches.':'Voice had a hiccup. Try again in a moment.';
  }else if(code==='TOKEN_DENIED'){
    o.title='Voice access denied';o.msg=raw==='banned'?'Banned accounts can\'t use voice.':'The voice server wouldn\'t let this account in ('+raw+').';o.retry=raw!=='banned';
  }else if(code==='TOKEN_SERVER'||code==='TOKEN_AUTH'){
    o.title='Couldn\'t get a voice pass';o.msg=raw+(own?' Check TOKEN_URL and that the Worker is deployed.':' Try again in a moment.');
  }else if(/UID_CONFLICT|UID_BANNED/i.test(all)){
    o.title='Already connected';o.msg='This account is still connected from another tab or device. Close it, wait a few seconds, and retry.';
  }else if(code==='SDK_LOAD'){
    o.title='Audio engine blocked';o.msg='The voice library couldn\'t load. Disable your ad-blocker for this site, or check your network.';
  }else if(code==='NOT_SUPPORTED'){
    o.title='Browser not supported';o.msg=raw;o.retry=false;
  }else if(code==='PRESENCE_TIMEOUT'){
    o.title='Database didn\'t answer';o.msg='Connected to the voice servers, but the site database didn\'t confirm your join. Check your connection and retry.';
  }else if(/PERMISSION_DENIED/i.test(all)){
    o.title='Voice wouldn\'t let you in';o.msg='If a moderator just muted or removed you, wait about 2 minutes and try again. Voice may also be turned off.';
  }else if(/JOIN_TIMEOUT|PUBLISH_TIMEOUT|GUARD_TIMEOUT|CAN_NOT_GET_GATEWAY_SERVER|NETWORK|TIMEOUT|WS_ABORT|SERVER_ERROR|OPERATION_ABORTED|CONNECTION|NO_CANDIDATES|ICE/i.test(all)){
    o.title=/PUBLISH_TIMEOUT|NO_CANDIDATES|ICE/i.test(all)?'Audio connection blocked':'Couldn\'t reach the voice servers';
    o.msg=BLOCK+(own?' If it still fails with everything off, make sure AGORA_APP_ID and AGORA_APP_CERTIFICATE in the Worker belong to the same enabled Agora project.':'');
  }else{
    o.title='Couldn\'t join voice';o.msg=raw+' If you were muted, banned or just removed, wait a bit and retry.';
  }
  return o;
}
function setErr(o){S.err=o;render()}
function info(title,msg,retry){setErr({title:title,msg:msg,code:'',retry:retry!==false,info:true})}
function micMessage(e){
  var c=String((e&&(e.code||e.name))||'')+' '+String((e&&e.message)||'');
  if(/PERMISSION|NotAllowed|denied/i.test(c))return 'Microphone is blocked. Allow it in your browser\'s site settings, then tap the mic.';
  if(/NOT_READABLE|NotReadable|in use/i.test(c))return 'Another app is using your microphone.';
  if(/DEVICE_NOT_FOUND|NotFound/i.test(c))return 'No microphone found.';
  if(/WEB_SECURITY|secure/i.test(c))return 'Browsers only allow the microphone on secure (https) pages.';
  return 'Couldn\'t open the microphone.';
}
async function makeMic(){
  try{S.micErr=false;S.micMsg='';return await AgoraRTC.createMicrophoneAudioTrack({AEC:true,ANS:true,AGC:true,encoderConfig:'speech_standard'})}
  catch(e){S.micErr=true;S.micMsg=micMessage(e);return null}
}
function onMicChanged(d){
  try{
    if(!S.track||!d||!d.device)return;
    if(d.state==='ACTIVE')S.track.setDevice(d.device.deviceId).catch(noop);
    else if(d.state==='INACTIVE'){AgoraRTC.getMicrophones().then(function(l){if(l&&l[0])S.track.setDevice(l[0].deviceId).catch(noop)}).catch(noop)}
  }catch(e){}
}

/* ---------- join / leave ----------
   Every attempt gets a generation number. cleanup() bumps it, so an attempt that was cancelled, timed out or
   superseded can never come back to life later - it only releases whatever it created (mic, Agora client).
   Every network step has a timeout, so "Connecting" can never hang forever. */
function setStage(s){S.stage=s;render()}
async function join(){
  if(S.joined||S.joining)return;
  var gen=++S.gen,track=null,c=null;
  var alive=function(){if(gen!==S.gen)throw Object.assign(new Error('cancelled'),{code:'CANCELLED'})};
  S.log=[];dbg('join start (token server '+(CFG.TOKEN_URL?'on':'off')+', '+(navigator.onLine===false?'OFFLINE':'online')+')');
  S.err=null;S.joining=true;S.micErr=false;S.micMsg='';S.stage='prep';S.slow=false;S.lastActive=now();render();
  var ready=S.me?true:await ensureReady();
  if(gen!==S.gen)return;
  var bail=function(t,m,r){S.joining=false;S.stage='';info(t,m,r)};
  if(!ready)return bail('Not connected yet','Voice couldn\'t reach the site\'s database yet. Reload the page, then try again.');
  if(!S.voiceOn)return bail('Voice is off','An owner turned voice off right now.',false);
  if(S.banned)return bail('Voice unavailable','Banned accounts can\'t use voice.',false);
  if(usageTotal(S.usage)>=CFG.MONTH_LIMIT&&!iAmOwner())return bail('Out of minutes','Voice has used all '+CFG.MONTH_LIMIT.toLocaleString()+' minutes for this month. It resets on the 1st (UTC).',false);
  var list=activeList();
  if(list.length>=CFG.MAX_USERS&&!list.some(function(m){return m.id===S.me.id}))return bail('Voice is full','There are already '+CFG.MAX_USERS+' people in voice. Try again soon.');
  try{
    S.timers.slow=setTimeout(function(){if(gen===S.gen&&S.joining&&!S.joined){S.slow=true;render()}},CFG.SLOW_HINT_MS);
    setStage('load');dbg('loading engine + token');
    var tokP=fetchToken();tokP.catch(noop);          // token + SDK load in parallel
    await withTimeout(loadSdk(),CFG.SDK_TIMEOUT_MS,'SDK_LOAD','The voice library took too long to load.');alive();
    var token=await tokP;alive();dbg('engine ready, token '+(token?'ok':'not used'));
    var sysOk=true;try{sysOk=!AgoraRTC.checkSystemRequirements||AgoraRTC.checkSystemRequirements()}catch(x){}
    if(!sysOk)throw Object.assign(new Error('This browser doesn\'t support voice calls.'),{code:'NOT_SUPPORTED'});

    setStage('mic');
    track=await makeMic();alive();S.track=track;dbg(track?'mic ok':'no mic: '+S.micMsg);
    var forced=isForced(S.me.id);
    S.mutedLocal=forced||!track;S.deaf=false;
    if(track&&S.mutedLocal){await track.setEnabled(false);alive()}

    setStage('connect');
    // absolute cap on the connect phase: whatever is still stuck after this gets torn down (frees the Agora channel + mic)
    S.timers.guard=setTimeout(function(){
      if(gen!==S.gen||S.joined)return;
      dbg('guard timeout - tearing everything down');
      var ex=explain({code:'GUARD_TIMEOUT',message:'The connection never finished.'});
      cleanup('').then(function(){setErr(ex)});
    },CFG.GUARD_MS);
    S.sid=Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,8);
    c=S.client=AgoraRTC.createClient({mode:'rtc',codec:'vp8'});
    c.on('user-published',async function(user,type){
      if(type!=='audio')return;
      try{await c.subscribe(user,'audio');S.remote[user.uid]=user;applyPlayback()}catch(e){}
    });
    c.on('user-unpublished',function(user,type){if(type==='audio'){delete S.speaking[String(user.uid)];delete S.level[String(user.uid)]}});
    c.on('user-left',function(user){delete S.remote[user.uid];delete S.speaking[String(user.uid)];delete S.level[String(user.uid)]});
    c.on('volume-indicator',function(vs){vs.forEach(function(v){
      var id=(v.uid===0||String(v.uid)===S.me.id)?S.me.id:String(v.uid);
      if(v.level>=6){S.speaking[id]=now();S.level[id]=v.level}else S.level[id]=0})});
    c.on('network-quality',function(q){
      var a=q.uplinkNetworkQuality||0,b=q.downlinkNetworkQuality||0,w=Math.max(a,b);
      S.q=!w?0:(w<=2?4:(w===3?3:(w===4?2:1)));updQuality()});
    c.on('token-privilege-will-expire',renewToken);
    c.on('token-privilege-did-expire',function(){renewToken()});
    c.on('connection-state-change',function(cur,prev,reason){
      dbg('agora '+prev+' -> '+cur+(reason?' ('+reason+')':''));
      S.reconnecting=cur==='RECONNECTING';
      if(cur==='DISCONNECTED'&&S.joined&&reason!=='LEAVE')cleanup('Disconnected from voice ('+reason+').');
      render();
    });
    dbg('agora join');
    await withTimeout(c.join(CFG.APP_ID,CFG.CHANNEL,token||null,Number(S.me.id)),CFG.JOIN_TIMEOUT_MS,'JOIN_TIMEOUT','Agora didn\'t answer in time.');alive();
    dbg('agora joined');
    try{c.enableAudioVolumeIndicator()}catch(x){}
    // from here on we really are in the Agora channel. Audio + our roster entry are set up together;
    // we only show up in the roster for others once the connection is real.
    S.mref=R('voice/members/'+S.me.id);var t=now();
    var pub=track?withTimeout(c.publish([track]),CFG.PUBLISH_TIMEOUT_MS,'PUBLISH_TIMEOUT','The audio connection didn\'t come up.'):Promise.resolve();
    var pres=withTimeout(S.fb.F.set(S.mref,{sid:S.sid,at:t,seen:t,muted:S.mutedLocal,deaf:false}),8000,'PRESENCE_TIMEOUT','The database didn\'t confirm your join.');
    pub.catch(noop);pres.catch(noop);
    await Promise.all([pub,pres]);alive();
    dbg('audio + presence ok');
    S.fb.F.onDisconnect(S.mref).remove().catch(noop);
    S.joined=true;S.joining=false;S.stage='';S.slow=false;S.err=null;S.joinAt=now();S.aloneSince=0;S.prevIds=null;S.heals=[];
    clearTimeout(S.timers.slow);clearTimeout(S.timers.guard);delete S.timers.slow;delete S.timers.guard;
    watch('voice/members/'+S.me.id,function(v){
      if(!S.joined)return;
      if(v==null)selfHeal();
      else if(v.sid!==S.sid){cleanup('You joined voice from another tab, so this one disconnected.',true,true)}
    },S.sess);
    watch('voice/kick/'+S.me.id,function(v){if(S.joined&&typeof v==='number'&&v>S.joinAt-1000)cleanup('A moderator removed you from voice.',true)},S.sess);
    S.timers.hb=setInterval(heartbeat,CFG.HEARTBEAT_MS);
    S.timers.tick=setInterval(tick,1000);
    S.timers.loc=setInterval(localLevel,120);
    S.timers.spk=setInterval(speakLoop,110);
    S.timers.use=setInterval(countMinute,60000);   // first minute is counted after 60s connected, not at the instant of joining
    beep(520,780);applyForce();rosterChanged();render();
    dbg('connected');
    if(S.micErr)toast(S.micMsg+' You joined listen-only.');
  }catch(e){
    if(gen!==S.gen||(e&&e.message==='cancelled')){
      // this attempt was cancelled / superseded: cleanup() already ran, just release anything it created afterwards
      dbg('attempt released'+(e&&e.message&&e.message!=='cancelled'?' ('+e.message+')':''));
      try{if(track&&track!==S.track&&!isReleased(track)){markReleased(track);track.stop();track.close()}}catch(x){}
      try{if(c&&c!==S.client&&!isReleased(c)){markReleased(c);c.removeAllListeners();Promise.resolve().then(function(){return c.leave()}).catch(noop)}}catch(x){}
      return;
    }
    dbg('FAILED '+String((e&&(e.code||e.name))||'')+': '+String((e&&e.message)||e));
    console.warn('[voice] join failed',e);
    var ex=explain(e);
    await cleanup('');setErr(ex);
  }
}

/* someone/something deleted our presence record while we're still connected (network blip fired onDisconnect).
   Unless a moderator kicked us, quietly write it back instead of dropping the call. */
async function selfHeal(){
  if(S.healing||!S.joined)return;S.healing=true;
  try{
    var k=(await S.fb.F.get(R('voice/kick/'+S.me.id))).val();
    if(typeof k==='number'&&k>S.joinAt-2000){cleanup('A moderator removed you from voice.',true);return}
    var t=now();S.heals=S.heals.filter(function(x){return x>t-60e3});
    if(S.heals.length>=3){cleanup('You were removed from voice.',true);return}
    S.heals.push(t);
    await S.fb.F.set(S.mref,{sid:S.sid,at:t,seen:t,muted:S.mutedLocal,deaf:S.deaf});
    S.fb.F.onDisconnect(S.mref).remove().catch(noop);
  }catch(e){if(S.joined)cleanup('You were removed from voice.',true)}
  finally{S.healing=false}
}

/* Tears EVERYTHING down: Agora channel (stops the minute meter), microphone, roster entry, timers.
   Safe to call at any time, any number of times. */
async function cleanup(msg,memberGone,keepMember){
  S.gen++;                       // invalidates any join attempt that is still in flight
  var F=S.fb&&S.fb.F;
  S.joined=false;S.joining=false;S.stage='';S.slow=false;
  Object.keys(S.timers).forEach(function(k){clearInterval(S.timers[k]);clearTimeout(S.timers[k])});S.timers={};
  S.sess.forEach(function(f){try{f()}catch(e){}});S.sess=[];
  var tr=S.track,cl=S.client,mref=S.mref;
  S.track=null;S.client=null;S.mref=null;S.remote={};S.speaking={};S.level={};S.reconnecting=false;S.mutedLocal=false;S.deaf=false;S.q=0;
  markReleased(tr);markReleased(cl);
  try{if(tr){tr.stop();tr.close()}}catch(e){}
  var p=[];
  if(cl){try{cl.removeAllListeners()}catch(e){}p.push(Promise.resolve().then(function(){return cl.leave()}).catch(noop))}
  if(mref&&F){try{F.onDisconnect(mref).cancel().catch(noop)}catch(e){}
    if(!memberGone&&!keepMember)p.push(F.remove(mref).catch(noop))}
  dbg('cleanup'+(msg?': '+msg:''));
  render();
  if(msg)toast(msg);
  await Promise.race([Promise.all(p),sleep(3000)]);   // never let a stuck leave() block the UI
}
function leave(){
  var was=S.joined;dbg(was?'left the call':'cancelled by user');
  cleanup('');if(was)beep(780,420);
}

/* ---------- connection test: tells you WHICH thing is blocked (button on the error card, or __vcTest() in the console) ---------- */
function stunProbe(){
  return new Promise(function(res){
    var found={host:0,srflx:0,relay:0},pc;
    try{pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]})}catch(e){return res(null)}
    var fin=false,done=function(){if(fin)return;fin=true;clearTimeout(to);try{pc.close()}catch(e){}res(found)};
    var to=setTimeout(done,4500);
    pc.onicecandidate=function(ev){if(!ev.candidate){done();return}var m=/ typ (\w+)/.exec(ev.candidate.candidate);if(m&&found[m[1]]!=null)found[m[1]]++};
    try{pc.createDataChannel('t');pc.createOffer().then(function(o){return pc.setLocalDescription(o)}).catch(done)}catch(e){done()}
  });
}
async function selfTest(){
  var out=['Voice connection test'],ok=function(m){out.push('OK    '+m)},bad=function(m){out.push('FAIL  '+m)};
  if(navigator.onLine===false)bad('Browser says you are offline');else ok('Browser is online');
  try{await withTimeout(loadSdk(),8000,'SDK_LOAD');ok('Agora audio engine loaded')}
  catch(e){bad('Agora audio engine did not load - an ad-blocker or network filter is blocking cdn.jsdelivr.net / agora.io')}
  if(CFG.TOKEN_URL){
    try{await withTimeout(fetch(CFG.TOKEN_URL,{mode:'no-cors',cache:'no-store'}),8000,'T');ok('Token server reachable')}
    catch(e){bad('Token server NOT reachable ('+CFG.TOKEN_URL+') - blocked by an ad-blocker/VPN, or the Worker URL is wrong')}
    if(S.me){try{await fetchToken(true);ok('Got a voice token for your account')}catch(e){bad('Voice token failed: '+String((e&&e.message)||e))}}
    else bad('Not signed in yet - can\'t test a token');
  }else out.push('INFO  No token server configured (TOKEN_URL is empty)');
  try{var st=await navigator.permissions.query({name:'microphone'});out.push((st.state==='denied'?'FAIL  ':'OK    ')+'Microphone permission: '+st.state)}catch(e){out.push('INFO  Microphone permission: unknown')}
  var f=await stunProbe();
  if(!f)bad('WebRTC is unavailable - a browser setting or extension blocks it');
  else if(f.srflx||f.relay)ok('UDP route to the internet works');
  else bad('No UDP route found - voice can\'t connect. A VPN, firewall, WebRTC-blocking extension or the browser\'s ad/tracker blocker is the usual cause.');
  out.push('INFO  '+(location.origin||location.href)+' | '+String(navigator.userAgent).slice(0,100));
  var txt=out.join('\n');try{console.log(txt)}catch(e){}
  return txt;
}

function hardLeave(){
  try{if(S.track)S.track.close()}catch(e){}
  try{if(S.client)S.client.leave()}catch(e){}
  try{if(S.mref&&S.fb)S.fb.F.remove(S.mref)}catch(e){}
}
addEventListener('pagehide',function(e){hardLeave();if(e&&e.persisted)cleanup('')});addEventListener('beforeunload',hardLeave);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&S.joined){pushState();rosterChanged();applyPlayback()}});

function pushState(){
  if(!S.joined||!S.mref)return;
  S.fb.F.update(S.mref,{muted:S.mutedLocal,deaf:S.deaf,seen:now()}).catch(noop);
}
function heartbeat(){pushState()}

/* ---------- mic / deafen / force-mute ---------- */
var busy=false;
async function toggleMute(){
  if(!S.joined||busy)return;busy=true;
  try{
    if(isForced(S.me.id)){toast('A moderator muted you — you can\'t unmute yet.');return}
    if(S.mutedLocal){
      if(!S.track){
        var tr=await makeMic();
        if(!tr){toast(S.micMsg||'Microphone is blocked. Allow it in your browser\'s site settings.');render();return}
        S.track=tr;try{await S.client.publish([S.track])}catch(e){try{S.track.close()}catch(x){}S.track=null;toast('Couldn\'t start your microphone.');return}
      }else await S.track.setEnabled(true);
      S.mutedLocal=false;
      if(S.deaf){S.deaf=false;applyPlayback()}
    }else{
      if(S.track)await S.track.setEnabled(false);
      S.mutedLocal=true;
    }
    pushState();render();
  }finally{busy=false}
}
async function toggleDeaf(){
  if(!S.joined||busy)return;busy=true;
  try{
    if(S.deaf){S.deaf=false;if(!S.wasMuted&&!isForced(S.me.id)&&S.track){await S.track.setEnabled(true);S.mutedLocal=false}}
    else{S.deaf=true;S.wasMuted=S.mutedLocal;if(S.track&&!S.mutedLocal)await S.track.setEnabled(false);S.mutedLocal=true}
    applyPlayback();pushState();render();
  }finally{busy=false}
}
async function applyForce(){
  if(!S.joined||!S.me||!isForced(S.me.id)||S.mutedLocal)return;
  try{if(S.track)await S.track.setEnabled(false)}catch(e){}
  S.mutedLocal=true;pushState();render();toast('A moderator muted your microphone.');
}
function applyPlayback(){
  Object.keys(S.remote).forEach(function(uid){
    var u=S.remote[uid],t=u&&u.audioTrack;if(!t)return;
    var off=S.deaf||isForced(String(uid))||S.localMute[uid];
    try{
      if(off){if(t.isPlaying)t.stop()}
      else{if(!t.isPlaying)t.play();t.setVolume(S.vol[uid]!=null?S.vol[uid]:100)}
    }catch(e){}
  });
}

/* ---------- timers: speaking, idle, alone ---------- */
function localLevel(){
  if(!S.track||S.mutedLocal||document.hidden){if(S.me)S.level[S.me.id]=0;return}
  try{var v=S.track.getVolumeLevel();S.level[S.me.id]=v*100;if(v>0.05){S.speaking[S.me.id]=now();S.lastActive=now()}}catch(e){}
}
function speakLoop(){
  if(!S.joined||!S.me)return;
  var t=now();
  Object.keys(S.tiles).forEach(function(id){
    var tl=S.tiles[id],m=S.members[id],muted=id===S.me.id?S.mutedLocal:!!(m&&m.muted);
    var sp=(S.speaking[id]||0)>t-420&&!muted&&!isForced(id);
    if(tl.sp!==sp){tl.sp=sp;tl.el.classList.toggle('speaking',sp)}
    var lv=sp?Math.min(1,(S.level[id]||0)/55):0;lv=Math.round(lv*20)/20;
    if(tl.lv!==lv){tl.lv=lv;tl.el.style.setProperty('--lvl',lv)}
  });
  if(S.sbEl){Array.prototype.forEach.call(S.sbEl.querySelectorAll('.vc-sb-u'),function(r){
    var id=r.dataset.id,m=S.members[id],muted=id===S.me.id?S.mutedLocal:!!(m&&m.muted);
    r.classList.toggle('speaking',(S.speaking[id]||0)>t-420&&!muted)})}
}
var lastRoster=0;
function tick(){
  if(!S.joined)return;
  var t=now();
  var tm=$('vcTime');if(tm)tm.textContent=fmtTime(t-S.joinAt);
  if(t-lastRoster>5000){lastRoster=t;applyPlayback();rosterChanged()}
  var others=activeList().filter(function(m){return m.id!==S.me.id}).length;
  if(!others){if(!S.aloneSince)S.aloneSince=t;else if(t-S.aloneSince>CFG.ALONE_MS)cleanup('You left voice because you were alone for a few minutes.')}
  else S.aloneSince=0;
  if(usageTotal(S.usage)>=CFG.MONTH_LIMIT&&!iAmOwner()){cleanup('Voice minutes for this month are used up.');return}
  if(monthKey()!==S.usageMonth)bindUsage();
  if(t-S.lastActive>CFG.IDLE_MS)cleanup('You left voice because you were inactive for a while.');
}
['pointerdown','keydown','wheel','touchstart'].forEach(function(ev){document.addEventListener(ev,function(){S.lastActive=now()},{passive:true,capture:true})});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')closePop();
  if(!S.open||!S.joined||e.ctrlKey||e.metaKey||e.altKey)return;
  var t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;
  var k=(e.key||'').toLowerCase();
  if(k==='m'){e.preventDefault();toggleMute()}else if(k==='d'){e.preventDefault();toggleDeaf()}
});
function updQuality(){
  [$('vcQ'),$('vcDockQ')].forEach(function(el){
    if(!el)return;el.classList.toggle('vc-off',!S.joined||!S.q);
    el.className=el.className.replace(/\bq[1-4]\b/g,'').trim()+(S.q?' q'+S.q:'');
    el.title='Connection: '+['','poor','weak','good','excellent'][S.q||0];
  });
}

/* ---------- moderation actions ---------- */
async function modMute(id){
  try{await S.fb.F.set(R('voice/forceMuted/'+id),{by:Number(S.me.id),until:now()+CFG.FORCE_MUTE_MS});toast('Muted '+userOf(id).name+' for '+Math.round(CFG.FORCE_MUTE_MS/60000)+' min.')}
  catch(e){toast('You can\'t mute that user.')}
}
async function modUnmute(id){try{await S.fb.F.remove(R('voice/forceMuted/'+id));toast('Server mute removed.')}catch(e){toast('Couldn\'t remove the mute.')}}
async function modKick(id){
  try{await S.fb.F.set(R('voice/kick/'+id),now());await S.fb.F.remove(R('voice/members/'+id));toast('Removed '+userOf(id).name+' from voice.')}
  catch(e){toast('You can\'t remove that user.')}
}
async function togglePower(){try{await S.fb.F.set(R('modSettings/voiceEnabled'),!S.voiceOn)}catch(e){toast('Only owners can do that.')}}

/* ---------- UI: sidebar entry ---------- */
function buildSb(){
  var el=h('div','vc-sb');el.id='vcSb';
  var b=h('button','vc-sb-btn');b.type='button';
  b.innerHTML='<span class="vc-sb-ic">🔊</span><span class="vc-sb-name">Voice Channel</span><span class="vc-sb-count" id="vcSbCount"></span>';
  b.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();openVoice()});
  b.addEventListener('pointerenter',warm);b.addEventListener('focus',warm);
  el.appendChild(b);el.appendChild(h('div','vc-sb-users'));S.sbEl=el;
}
var mounting=false;
function mountSb(){
  /* The voice channel now lives in the Extras menu (index.html #exVoice), so the Global sidebar entry is no
     longer inserted. S.sbEl is still built (detached) because the count/active-state code uses it. */
  var list=$('sbList');if(!list||mounting)return;mounting=true;
  try{
    if(!S.sbEl)buildSb();
    var txt='';Array.prototype.forEach.call(list.children,function(c){if(c!==S.sbEl)txt+=' '+c.textContent});
    if(S.sbEl.parentNode)S.sbEl.remove();
    if(/friends & requests|direct messages/i.test(txt)){if(S.open)closeView();return}
    renderSb();
  }finally{mounting=false}
}

/* ---------- UI: view ---------- */
function buildView(main){
  if(S.view&&S.view.parentNode===main)return;
  var v=S.view||h('div');v.id='vcView';
  v.innerHTML='<div class="vc-head"><div class="vc-title"><span class="vc-title-ic">'+I.spk+'</span><b>Voice Channel</b><span class="vc-sep"></span><span class="vc-sub" id="vcSub" role="status" aria-live="polite"></span>'+
   '<span class="vc-time vc-off" id="vcTime"></span><span class="vc-q vc-off" id="vcQ"><i></i><i></i><i></i><i></i></span></div>'+
   '<div class="vc-head-r"><button type="button" class="vc-usage" id="vcUsage"></button><button type="button" class="vc-chip vc-off" id="vcPower"></button></div></div>'+
   '<div class="vc-stage"><div class="vc-grid" id="vcGrid"></div><div class="vc-empty vc-off" id="vcEmpty"><div class="vc-empty-ic"><span class="vc-ring r1"></span><span class="vc-ring r2"></span><span class="vc-ring r3"></span>'+I.mic+'</div><b>No one\'s in voice yet</b><span>Hop in — be the first. Your mic starts on.</span></div></div>'+
   '<div class="vc-bar" id="vcBar"></div>';
  v.addEventListener('click',closePop);
  main.appendChild(v);S.view=v;
  $('vcPower').addEventListener('click',togglePower);$('vcUsage').addEventListener('click',showUsage);renderUsage();
  S.tiles={};
}
function openVoice(){
  warm();
  var cp=$('chatPage');
  if(cp&&cp.classList.contains('hidden')){
    /* From the home screen (Extras): "Itsukis Chat" only opens the chooser (VIP / Global / Rooms / Announcements / Pass), so
       open it, press "Global Chat" for the person, wait for the chat page, then show the voice channel inside it. */
    var n=0,openedPicker=false,pickedGlobal=false,landed=false;
    (function step(){
      var c2=$('chatPage');
      if(c2&&!c2.classList.contains('hidden')){
        if(!landed){landed=true;setTimeout(function(){showView();if(!S.me)ensureReady()},150)}
        return;
      }
      var gc=$('gcGlobal');
      if(gc){if(!pickedGlobal){pickedGlobal=true;gc.click()}}
      else if(!openedPicker&&!$('gcBg')){var g=$('goGlobal');if(g){openedPicker=true;g.click()}}
      if(++n<80)setTimeout(step,120);
    })();
    return;
  }
  showView();
  if(!S.me)ensureReady();
}
function showView(){
  var main=document.querySelector('#chatPage .main');if(!main)return;
  buildView(main);
  var title=$('chatTitle'),top=main.querySelector('.topbar');
  if(!S.open&&title){S.prevTitle=title.textContent}
  if(title)title.textContent='🔊 Voice Channel';
  main.style.setProperty('--vc-top',(top?top.offsetHeight:56)+'px');
  main.classList.add('vc-open');S.open=true;
  if(S.sbEl)S.sbEl.classList.add('active');
  if(innerWidth<=720){var sb=$('sidebar'),mb=$('menuBtn');if(sb&&mb&&sb.getBoundingClientRect().right>40)mb.click()}
  warm();render();
}
function closeView(){
  if(!S.open)return;S.open=false;
  var main=document.querySelector('#chatPage .main');if(main)main.classList.remove('vc-open');
  var title=$('chatTitle');if(title&&title.textContent==='🔊 Voice Channel'&&S.prevTitle!=null)title.textContent=S.prevTitle;
  if(S.sbEl)S.sbEl.classList.remove('active');closePop();render();
}

/* ---------- UI: tile in the Global Chat / Rooms / Announcements picker ---------- */
function findPicker(){
  var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n;
  while((n=w.nextNode())){
    if(n.nodeValue.trim()!=='Announcements')continue;
    var el=n.parentElement;if(!el||el.closest('#sidebar,#vcView,#vcSb,#vcTile'))continue;
    var t=el;
    while(t&&t.parentElement&&t.parentElement!==document.body){
      var p=t.parentElement;
      if(p.children.length>=3&&p.children.length<=8&&p.textContent.length<400&&/Global Chat/i.test(p.textContent)&&/Rooms/i.test(p.textContent)&&t.getBoundingClientRect().height>=70)return {tile:t,grid:p};
      t=p;
    }
  }
  return null;
}
function mountTile(){
  var ex=$('vcTile');if(ex&&ex.isConnected)return;
  var f=findPicker();if(!f)return;
  var t=f.tile,c=t.cloneNode(true);
  var oi=t.querySelector('img,svg,canvas,picture'),sz=oi?(Math.round(oi.getBoundingClientRect().height)||56):56;
  [c].concat(Array.prototype.slice.call(c.querySelectorAll('*'))).forEach(function(e){
    e.removeAttribute('id');e.removeAttribute('onclick');
    Array.prototype.slice.call(e.attributes).forEach(function(a){if(/^data-/.test(a.name))e.removeAttribute(a.name)});
    e.classList.remove('active','selected','on');
  });
  Array.prototype.slice.call(c.querySelectorAll('[class*=badge]')).forEach(function(b){b.remove()});
  var emo=h('span','vc-tile-ic','🎙️');emo.style.cssText='font-size:'+Math.round(sz*.85)+'px;line-height:1;display:block';
  var ic=c.querySelector('img,svg,canvas,picture'),w=document.createTreeWalker(c,NodeFilter.SHOW_TEXT,null),n,titleEl=null,emoNode=null;
  while((n=w.nextNode())){
    if(n.nodeValue.trim()==='Announcements'){n.nodeValue='Global Voice Channel';titleEl=n.parentElement}
    else if(!emoNode&&/[^\x00-\x7F]/.test(n.nodeValue))emoNode=n;
  }
  if(ic)ic.replaceWith(emo);else if(emoNode)emoNode.nodeValue='🎙️';else c.insertBefore(emo,c.firstChild);
  var sub=h('div','vc-tile-sub','Tap to join');sub.style.cssText='font-size:12px;opacity:.7;margin-top:4px;font-weight:600';
  c.appendChild(sub);
  c.id='vcTile';c.setAttribute('role','button');c.setAttribute('tabindex','0');
  c.style.gridColumn='1 / -1';c.style.flex='1 1 100%';
  c.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();openFromPicker(f.grid)},true);
  c.addEventListener('pointerenter',warm);c.addEventListener('focus',warm);
  c.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openFromPicker(f.grid)}});
  f.grid.insertBefore(c,t.nextSibling);
  renderTile();
}
function renderEx(){
  var s=$('exVoiceSub'),d=$('exVoiceLive');if(!s)return;
  var n=0;try{n=activeList().length}catch(e){}
  s.textContent=S.joining?'Connecting…':(S.joined?('Connected · '+n+' in call'):(n?(n+' in call · tap to join'):'Talk with everyone in Global'));
  if(d)d.classList.toggle('on',!!(S.joined||n));
}
function renderTile(){
  renderEx();
  var tile=$('vcTile');if(!tile)return;
  tile.classList.toggle('vc-live',!!S.joined);tile.classList.toggle('vc-connecting',!!S.joining);
  var s=tile.querySelector('.vc-tile-sub');if(!s)return;
  var n=activeList().length;
  s.textContent=S.joining?'Connecting…':(S.joined?(n+' in call · Connected'):(n?n+' in call':'Tap to join'));
}
function openFromPicker(grid){
  var g=null;Array.prototype.forEach.call(grid.children,function(c){if(c.id!=='vcTile'&&/Global Chat/i.test(c.textContent))g=c});
  if(g)g.click();
  setTimeout(function(){showView();if(!S.me)ensureReady()},320);
}

/* ---------- UI: dock ---------- */
function clampDock(){
  var d=S.dock;if(!d||!d.style.left)return;
  var x=Math.max(4,Math.min(innerWidth-d.offsetWidth-4,parseInt(d.style.left)||0)),y=Math.max(4,Math.min(innerHeight-d.offsetHeight-4,parseInt(d.style.top)||0));
  d.style.left=x+'px';d.style.top=y+'px';
}
function buildDock(){
  var d=h('div','vc-dock vc-off');d.id='vcDock';
  d.innerHTML='<div class="vc-dock-info" id="vcDockInfo"><span class="vc-live"></span><div><b>Voice Connected</b><small id="vcDockSub"></small></div><span class="vc-q vc-off" id="vcDockQ"><i></i><i></i><i></i><i></i></span></div><div class="vc-dock-btns" id="vcDockBtns"></div>';
  document.body.appendChild(d);S.dock=d;
  try{var p=JSON.parse(localStorage.getItem('vcDockPos')||'null');if(p){d.style.left=p.x+'px';d.style.top=p.y+'px';d.style.right='auto';d.style.bottom='auto'}}catch(e){}
  var info=$('vcDockInfo'),sx,sy,ox,oy,mv=false,down=false;
  info.addEventListener('pointerdown',function(e){down=true;mv=false;sx=e.clientX;sy=e.clientY;var r=d.getBoundingClientRect();ox=r.left;oy=r.top;info.setPointerCapture(e.pointerId)});
  info.addEventListener('pointermove',function(e){if(!down)return;if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>6)mv=true;if(!mv)return;
    d.classList.add('dragging');
    var x=Math.max(4,Math.min(innerWidth-d.offsetWidth-4,ox+e.clientX-sx)),y=Math.max(4,Math.min(innerHeight-d.offsetHeight-4,oy+e.clientY-sy));
    d.style.left=x+'px';d.style.top=y+'px';d.style.right='auto';d.style.bottom='auto'});
  info.addEventListener('pointerup',function(){down=false;d.classList.remove('dragging');if(mv){try{localStorage.setItem('vcDockPos',JSON.stringify({x:parseInt(d.style.left),y:parseInt(d.style.top)}))}catch(e){}}else openVoice()});
  info.addEventListener('pointercancel',function(){down=false;d.classList.remove('dragging')});
  clampDock();
}

/* ---------- render ---------- */
function btn(cls,icon,title,fn,label){
  var b=h('button','vc-btn '+cls);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.innerHTML=icon+(label?'<span>'+label+'</span>':'');
  b.addEventListener('click',function(e){e.stopPropagation();fn()});return b;
}
function render(){try{renderSb();renderTile();renderView();renderDock();updQuality()}catch(e){console.error('[voice]',e)}}
function renderSb(){
  var el=S.sbEl;if(!el)return;
  var list=activeList(),c=el.querySelector('#vcSbCount'),box=el.querySelector('.vc-sb-users');
  if(c)c.textContent=list.length?String(list.length):'';
  el.classList.toggle('vc-live',!!S.joined);
  var key=list.map(function(m){return m.id+(m.muted?'m':'')+(m.deaf?'d':'')+(isForced(m.id)?'f':'')+userOf(m.id).name}).join('|');
  if(box._k===key)return;box._k=key;box.textContent='';
  list.slice(0,8).forEach(function(m){
    var u=userOf(m.id),r=h('div','vc-sb-u'),a=h('span','vc-sb-av');fillAvatar(a,u);r.dataset.id=m.id;
    r.appendChild(a);r.appendChild(h('span','vc-sb-un',u.name));
    if(m.deaf||m.muted||isForced(m.id)){var s=h('span','vc-sb-st');s.innerHTML=m.deaf?I.headOff:I.micOff;r.appendChild(s)}
    box.appendChild(r)});
  if(list.length>8)box.appendChild(h('div','vc-sb-more','+'+(list.length-8)+' more'));
}
function fillAvatar(av,u){
  var k=(u.avatar?u.avatar.length+u.avatar.slice(-24):'')+'|'+u.name;if(av._k===k)return;av._k=k;av.textContent='';
  if(u.avatar&&/^data:image\//.test(u.avatar)){av.style.background='';var im=new Image();im.src=u.avatar;im.alt='';im.draggable=false;av.appendChild(im)}
  else{av.textContent=(u.name||'?').charAt(0).toUpperCase();av.style.background=colorOf(u.name||'?')}
}
function tileFor(id){
  var t=S.tiles[id];if(t)return t;
  var el=h('div','vc-tile'),glow=h('div','vc-glow'),avw=h('div','vc-avw'),ring=h('i','vc-ring-s'),av=h('div','vc-av'),
      nm=h('div','vc-nm'),eq=h('span','vc-eq'),name=h('span','vc-nm-t'),tag=h('span','vc-tag'),st=h('div','vc-st');
  eq.innerHTML='<i></i><i></i><i></i>';
  el.dataset.id=id;el.setAttribute('role','button');el.setAttribute('tabindex','0');
  avw.appendChild(ring);avw.appendChild(av);nm.appendChild(eq);nm.appendChild(name);nm.appendChild(tag);
  el.appendChild(glow);el.appendChild(avw);el.appendChild(nm);el.appendChild(st);
  el.addEventListener('click',function(e){e.stopPropagation();showPop(id,el)});
  el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();showPop(id,el)}});
  return S.tiles[id]={el:el,av:av,name:name,tag:tag,st:st,sp:false,lv:0};
}
function nth(grid,i){var n=0;for(var c=grid.firstElementChild;c;c=c.nextElementSibling){if(c.classList.contains('leaving'))continue;if(n++===i)return c}return null}
function renderView(){
  var v=S.view;if(!v||!S.open)return;
  var list=activeList(),grid=$('vcGrid');if(!grid)return;
  var keep={};
  list.forEach(function(m,i){
    var id=m.id,t=tileFor(id),u=userOf(id),forced=isForced(id),muted=m.muted||forced;keep[id]=1;
    fillAvatar(t.av,u);
    var nm=u.name+(S.me&&id===S.me.id?' (you)':'');if(t.name.textContent!==nm)t.name.textContent=nm;
    var hue=hueOf(u.name||'?');if(t.hue!==hue){t.hue=hue;t.el.style.setProperty('--h',hue)}
    var tg=isOwnerId(id)?'OWNER':(S.admins[id]===1?'ADMIN':(S.mods[id]===1?'MOD':''));if(t.tag.textContent!==tg)t.tag.textContent=tg;t.tag.className='vc-tag'+(tg?' '+tg.toLowerCase():'');
    var sk=m.deaf?'d':(muted?'m':'o')+(forced?'f':'');
    if(t.st._k!==sk){t.st._k=sk;t.st.innerHTML=m.deaf?I.headOff:(muted?I.micOff:I.mic);t.st.title=forced?'Muted by a moderator':(m.deaf?'Deafened':(muted?'Muted':'Mic on'))}
    t.el.classList.toggle('muted',!!muted);t.el.classList.toggle('forced',forced);t.el.classList.toggle('deaf',!!m.deaf);t.el.classList.toggle('self',!!(S.me&&id===S.me.id));
    var cur=nth(grid,i);if(cur!==t.el)grid.insertBefore(t.el,cur);
  });
  Object.keys(S.tiles).forEach(function(id){
    if(keep[id])return;
    var el=S.tiles[id].el;delete S.tiles[id];el.classList.add('leaving');setTimeout(function(){el.remove()},260);
  });
  grid.classList.toggle('few',list.length<=2);
  $('vcEmpty').classList.toggle('vc-off',list.length>0||!S.voiceOn);
  var sub=$('vcSub');if(sub){var st=!S.voiceOn?'Turned off':(list.length?list.length+' in voice'+(S.reconnecting?' · reconnecting…':''):'Empty');if(sub.textContent!==st)sub.textContent=st;sub.classList.toggle('reconnecting',!!S.reconnecting)}
  var tm=$('vcTime');if(tm){tm.classList.toggle('vc-off',!S.joined);if(S.joined)tm.textContent=fmtTime(now()-S.joinAt)}
  var pw=$('vcPower');if(pw){pw.classList.toggle('vc-off',!iAmOwner());pw.textContent=S.voiceOn?'Voice: ON':'Voice: OFF';pw.classList.toggle('red',!S.voiceOn)}
  renderBar();
}
var STEPS=[['load','Audio engine'],['mic','Microphone'],['connect','Connecting']];
function stepIdx(s){for(var i=0;i<STEPS.length;i++)if(STEPS[i][0]===s)return i;return s==='prep'?-1:(s==='cancel'?-2:STEPS.length)}
function renderBar(){
  var bar=$('vcBar');if(!bar)return;
  var full=S.me&&activeList().length>=CFG.MAX_USERS&&!S.joined;
  var key=[S.joined,S.joining,S.stage,S.mutedLocal,S.deaf,S.me&&isForced(S.me.id),!!S.track,S.micErr,S.voiceOn,S.banned,!!full,S.err&&(S.err.code+S.err.title+(S.err.testing?'T':'')+(S.err.test?S.err.test.length:0)),iAmOwner(),S.slow].join();
  if(bar._k===key)return;bar._k=key;bar.textContent='';
  if(!S.voiceOn){bar.appendChild(h('div','vc-note','Voice is turned off by an owner right now.'));return}
  if(S.joined){
    var forced=S.me&&isForced(S.me.id);
    bar.classList.add('vc-bar-live');
    bar.appendChild(btn('mic'+(S.mutedLocal?' off':''),S.mutedLocal?I.micOff:I.mic,(forced?'Muted by a moderator':(S.mutedLocal?'Unmute (M)':'Mute (M)')),toggleMute));
    bar.appendChild(btn('deaf'+(S.deaf?' off':''),S.deaf?I.headOff:I.head,S.deaf?'Undeafen (D)':'Deafen (D)',toggleDeaf));
    bar.appendChild(btn('leave',I.leave,'Disconnect',leave));
    if(S.micErr)bar.appendChild(h('div','vc-note vc-note-warn','Listen-only: '+(S.micMsg||'microphone unavailable')));
    else bar.appendChild(h('div','vc-note','Shortcuts: M mute · D deafen'));
    return;
  }
  bar.classList.remove('vc-bar-live');
  if(S.joining){
    var idx=stepIdx(S.stage),box=h('div','vc-steps');
    STEPS.forEach(function(s,i){
      var st=h('div','vc-step'+(i<idx?' done':(i===idx?' active':'')));
      var dot=h('span','vc-step-dot');if(i<idx)dot.innerHTML=I.check;st.appendChild(dot);st.appendChild(h('span','vc-step-t',s[1]));
      if(i<STEPS.length-1)st.appendChild(h('i','vc-step-line'));box.appendChild(st)});
    bar.appendChild(box);
    var cb=h('button','vc-cancel',S.stage==='cancel'?'Cancelling…':'Cancel');cb.type='button';cb.disabled=S.stage==='cancel';
    cb.addEventListener('click',function(e){e.stopPropagation();leave()});bar.appendChild(cb);
    if(S.stage==='mic')bar.appendChild(h('div','vc-note','If your browser asks, allow the microphone.'));
    else if(S.slow)bar.appendChild(h('div','vc-note vc-slow','Taking longer than usual… ad-blockers, VPNs and firewalls can stall voice. It gives up on its own after a short while, or you can cancel.'));
    return;
  }
  if(S.err){
    var e=S.err,card=h('div','vc-err'+(e.info?' info':'')),ic=h('div','vc-err-ic');ic.innerHTML=I.warn;
    var tx=h('div','vc-err-tx');tx.appendChild(h('b',null,e.title));tx.appendChild(h('span',null,e.msg));
    card.appendChild(ic);card.appendChild(tx);
    var row=h('div','vc-err-btns');
    if(e.retry){var rb=h('button','vc-err-b main');rb.type='button';rb.innerHTML=I.retry+'<span>Try again</span>';rb.addEventListener('click',function(ev){ev.stopPropagation();S.err=null;join()});row.appendChild(rb)}
    if(e.code||e.raw){var cp=h('button','vc-err-b');cp.type='button';cp.innerHTML=I.copy+'<span>Copy details</span>';
      cp.addEventListener('click',function(ev){ev.stopPropagation();var txt='['+(e.code||'ERROR')+'] '+(e.raw||e.msg)+'\n'+S.log.join('\n')+(e.test?'\n\n'+e.test:'');try{navigator.clipboard.writeText(txt).then(function(){toast('Copied')},function(){toast('Couldn\'t copy - open the browser console instead')})}catch(x){toast('Couldn\'t copy - open the browser console instead')}});row.appendChild(cp)}
    if(!e.info){var tb=h('button','vc-err-b');tb.type='button';tb.disabled=!!e.testing;tb.innerHTML='<span>'+(e.testing?'Testing…':'Run connection test')+'</span>';
      tb.addEventListener('click',function(ev){ev.stopPropagation();e.testing=true;render();selfTest().then(function(t){e.test=t;e.testing=false;render()},function(){e.testing=false;render()})});row.appendChild(tb)}
    var dm=h('button','vc-err-b');dm.type='button';dm.textContent='Dismiss';dm.addEventListener('click',function(ev){ev.stopPropagation();S.err=null;render()});row.appendChild(dm);
    card.appendChild(row);
    if(e.test)card.appendChild(h('pre','vc-test',e.test));
    bar.appendChild(card);return;
  }
  var j=h('button','vc-join');j.type='button';
  j.innerHTML='<span class="vc-join-ic">'+I.mic+'</span><span>'+(full?'Voice is full':(S.banned?'Unavailable':'Join Voice'))+'</span>';
  j.disabled=!!full||S.banned;
  j.addEventListener('click',function(e){e.stopPropagation();join()});
  bar.appendChild(j);
  bar.appendChild(h('div','vc-note','Audio only · your mic starts on · leaving or closing the tab disconnects you · doesn\'t work on school Chromebooks or with ad blockers'));
}
function renderDock(){
  if(!S.dock)buildDock();
  var d=S.dock,show=S.joined&&!(S.open&&$('chatPage')&&!$('chatPage').classList.contains('hidden'));
  d.classList.toggle('vc-off',!show);if(!show)return;
  var n=activeList().length;$('vcDockSub').textContent=n+' in call'+(S.reconnecting?' · reconnecting…':'');
  var box=$('vcDockBtns'),forced=S.me&&isForced(S.me.id),key=[S.mutedLocal,S.deaf,forced].join();
  if(box._k===key)return;box._k=key;box.textContent='';
  box.appendChild(btn('mic sm'+(S.mutedLocal?' off':''),S.mutedLocal?I.micOff:I.mic,S.mutedLocal?'Unmute':'Mute',toggleMute));
  box.appendChild(btn('deaf sm'+(S.deaf?' off':''),S.deaf?I.headOff:I.head,S.deaf?'Undeafen':'Deafen',toggleDeaf));
  box.appendChild(btn('leave sm',I.leave,'Disconnect',leave));
}

/* ---------- per-user popover ---------- */
function closePop(){var p=$('vcPop');if(p)p.remove()}
function showPop(id,anchor){
  closePop();var u=userOf(id),me=S.me&&id===S.me.id,p=h('div','vc-pop');p.id='vcPop';
  p.addEventListener('click',function(e){e.stopPropagation()});
  p.appendChild(h('div','vc-pop-h',u.name));var n=0;
  var uid=Number(id);
  if(!me&&S.joined){n++;
    var row=h('div','vc-pop-row');row.innerHTML=I.vol;var sl=document.createElement('input');sl.type='range';sl.min=0;sl.max=200;sl.value=S.vol[uid]!=null?S.vol[uid]:100;
    sl.setAttribute('aria-label','Volume');
    sl.addEventListener('input',function(){S.vol[uid]=+sl.value;applyPlayback()});row.appendChild(sl);p.appendChild(row);
    var lm=h('button','vc-pop-b',S.localMute[uid]?'Unmute for me':'Mute for me');lm.type='button';
    lm.addEventListener('click',function(){S.localMute[uid]=!S.localMute[uid];applyPlayback();closePop()});p.appendChild(lm)}
  if(canMod(id)){n++;p.appendChild(h('div','vc-pop-sep'));
    var m=h('button','vc-pop-b',isForced(id)?'Remove server mute':'Server mute ('+Math.round(CFG.FORCE_MUTE_MS/60000)+' min)');m.type='button';
    m.addEventListener('click',function(){closePop();isForced(id)?modUnmute(id):modMute(id)});p.appendChild(m);
    var k=h('button','vc-pop-b red','Remove from voice');k.type='button';k.addEventListener('click',function(){closePop();modKick(id)});p.appendChild(k)}
  if(!n)return;
  S.view.appendChild(p);
  var vr=S.view.getBoundingClientRect(),ar=anchor.getBoundingClientRect();
  p.style.left=Math.max(8,Math.min(ar.left-vr.left+ar.width/2-110,vr.width-228))+'px';
  p.style.top=Math.max(8,Math.min(ar.bottom-vr.top+6,vr.height-p.offsetHeight-8))+'px';
}

/* ---------- boot ---------- */
function boot(){
  var list=$('sbList');
  if(!list){setTimeout(boot,500);return}
  new MutationObserver(function(){if(!mounting)setTimeout(mountSb,0)}).observe(list,{childList:true});
  mountSb();buildDock();
  document.addEventListener('click',function(e){
    var t=e.target;if(!t||!t.closest)return;
    if(S.open&&(t.closest('#sbList')&&!t.closest('#vcSb')||t.closest('#backHome,#goGlobal,#goDMs,#goSettings,#goGameHubs,#settingsBtn')))closeView();
  },true);
  var cp=$('chatPage');
  if(cp)new MutationObserver(function(){if(cp.classList.contains('hidden')){closeView();mountSb()}else mountSb();renderDock()}).observe(cp,{attributes:true,attributeFilter:['class']});
  addEventListener('resize',function(){var m=document.querySelector('#chatPage .main'),tb=m&&m.querySelector('.topbar');if(tb)m.style.setProperty('--vc-top',tb.offsetHeight+'px');clampDock()});
    fbBoot(0);
}
window.__vcDiag=function(){return {fb:!!S.fb,me:S.me,joined:S.joined,joining:S.joining,stage:S.stage,gen:S.gen,err:S.err&&{code:S.err.code,title:S.err.title},members:S.members,voiceOn:S.voiceOn,sdk:!!window.AgoraRTC,tokenUrl:CFG.TOKEN_URL,appId:CFG.APP_ID,log:S.log.slice(-40)}};
window.__vcTest=selfTest;                 // console: await __vcTest()
window.__vcApi={join:join,leave:leave};   // console / automated tests
function wireExtras(){
  var b=$('exVoice');if(!b||b.__vc)return;b.__vc=1;
  b.addEventListener('click',function(e){e.preventDefault();openVoice()});
  b.addEventListener('pointerenter',warm);b.addEventListener('focus',warm);
}
function startAll(){wireExtras();boot()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startAll);else startAll();
})();
