/* ==========================================================================
 * js/ui/navigation.js
 * Page switching, go-home, unread badge
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Navigation ---------- */
function show(p){
  ['loadingPage','authPage','homePage','chatPage'].forEach(id=>{const el=$('#'+id);if(el)el.classList.toggle('hidden',id!==p)});
  view.page=p;
}
function goHome(forceMenu){
  ME=DB.currentUser();
  if(!ME){
    // signed in but no profile yet (e.g. Google): finish setup instead of crashing
    if(DB.needsProfile()){show('authPage');modalPickUsername()}
    else show('authPage');
    return;
  }
  $('#homeName').textContent=ME.username;$('#homeName2').textContent=ME.username;
  $('#homeAv').outerHTML=avatarHtml(ME,ME.username,'width:34px;height:34px;font-size:14px').replace('class="avatar"','class="avatar" id="homeAv"');
  applyStyle(document.documentElement,ME.settings);
  refreshBadge();
  // Discord look: land in DMs instead of the main-menu grid (the rail's "Main menu" button / Home passes forceMenu).
  if(!forceMenu&&typeof DiscordLook!=='undefined'&&DiscordLook.on()){openChat('dms');return}
  show('homePage');
}
function refreshBadge(){
  if(!ME)return;const n=DB.unreadDMs(ME.id);
  const b=$('#dmBadge');b.classList.toggle('hidden',!n);b.textContent=n;
  const a=DB.unreadAnnouncements(ME.id),ab=$('#annBadge');
  if(ab){ab.classList.toggle('hidden',!a);ab.textContent=a>99?'99+':a;ab.title=a+' new announcement'+(a===1?'':'s')}
  refreshAnnPicker();
  $('#onlineCount').textContent=DB.onlineCount();
  refreshMarkRead();
}
$('#homeOnlinePill').onclick=()=>openOnlineModal('Online now',DB.onlineIds());

// Circular unread badge on the Announcements card of the chat picker (live: also called from live-sync).
function refreshAnnPicker(){
  const b=document.getElementById('gcAnnBadge');if(!b||!ME)return;
  const n=DB.unreadAnnouncements(ME.id);
  b.textContent=n>99?'99+':n;b.classList.toggle('show',n>0);
  b.title=n+' new announcement'+(n===1?'':'s');
  const sb=document.getElementById('gcShitBadge');
  if(sb){const k=DB.unreadShitposts(ME.id);sb.textContent=k>99?'99+':k;sb.classList.toggle('show',k>0);sb.title=k+' new shitpost'+(k===1?'':'s')}
}


/* ---------- "Mark all as read" ----------
   One button in two places (home footer + chat topbar), only visible while something is unread.
   Built from JS so only js/css files need updating. */
const _MR_CHECK='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l4.8 4.8L19.5 7"/></svg>';
function _mkMarkRead(id,mini){
  const b=document.createElement('button');
  b.type='button';b.id=id;b.className='markread-btn hidden'+(mini?' mini':'');
  b.title='Mark everything as read';b.setAttribute('aria-label','Mark all as read');
  b.innerHTML=_MR_CHECK+'<span class="mr-t">'+(mini?'Read all':'Mark all as read')+'</span>';
  b.onclick=async()=>{
    if(!ME||b.disabled)return;
    b.disabled=true;
    try{
      await DB.markAllRead(ME.id);
      toast('All caught up ✓');
      refreshBadge();
      if(view.page==='chatPage'&&typeof renderChat==='function')renderChat();
    }catch(e){toast('Could not mark as read ('+(e.code||e.message)+')','bad')}
    finally{b.disabled=false;refreshMarkRead()}
  };
  return b;
}
{
  const foot=document.querySelector('#homePage .home-foot'),tbr=document.querySelector('.topbar .tb-right');
  if(foot)foot.appendChild(_mkMarkRead('markReadHome',false));
  if(tbr)tbr.insertBefore(_mkMarkRead('markReadTop',true),tbr.firstChild);
}
function refreshMarkRead(){
  if(!ME)return;
  let n=0;try{n=DB.unreadTotal(ME.id)}catch(_){}
  ['markReadHome','markReadTop'].forEach(id=>{const b=document.getElementById(id);if(b)b.classList.toggle('hidden',!n)});
}
DB.onChange(()=>{try{refreshMarkRead()}catch(_){}});


/* ---------- Mobile helpers ----------
   - Settings button: label wrapped so CSS can collapse it to an icon on phones
   - tap the dimmed area to close the slide-out sidebar
   - swipe right from the left edge to open it, swipe left to close it */
{
  const sb=document.getElementById('settingsBtn');
  if(sb&&!sb.querySelector('.rb-t'))sb.innerHTML='⚙️ <span class="rb-t">Settings</span>';
  const layout=document.querySelector('.chat-layout');
  if(layout)layout.addEventListener('click',e=>{
    if(e.target!==layout)return;                       // only the dim layer itself (the ::before), not real content
    const side=document.getElementById('sidebar');
    if(side&&side.classList.contains('open'))side.classList.remove('open');
  });
  let sx=0,sy=0,track=false;
  document.addEventListener('touchstart',e=>{
    const t=e.touches[0];sx=t.clientX;sy=t.clientY;
    track=e.touches.length===1&&innerWidth<=760&&typeof view!=='undefined'&&view.page==='chatPage';
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!track)return;track=false;
    const t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
    if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.8)return;   // must be a clear, mostly-horizontal swipe
    const side=document.getElementById('sidebar');
    if(!side||side.classList.contains('gc-hide'))return;
    if(dx>0&&sx<60)side.classList.add('open');
    else if(dx<0&&side.classList.contains('open'))side.classList.remove('open');
  },{passive:true});
}
