/* mobile-sidebar.js — turns the sidebar into a slide-out drawer on phones,
   and restyles the "Mark all as read" button. Desktop behaviour is untouched. */
(function(){
  if(window.__mobileSidebar)return;window.__mobileSidebar=true;
  var mq=window.matchMedia('(max-width:820px)');
  var body=document.body;

  var backdrop=document.createElement('div');
  backdrop.className='ms-backdrop';
  document.body.appendChild(backdrop);

  function isMobile(){return mq.matches}
  function isOpen(){return body.classList.contains('ms-open')}
  function open(){if(isMobile())body.classList.add('ms-open')}
  function close(){body.classList.remove('ms-open')}
  function toggle(){isOpen()?close():open()}
  window.msSidebar={open:open,close:close,toggle:toggle};

  /* ☰ button: on mobile it ONLY toggles the drawer (capture so older toggle code can't fight it) */
  document.addEventListener('click',function(e){
    var mb=e.target.closest&&e.target.closest('#menuBtn');
    if(mb&&isMobile()){
      e.preventDefault();e.stopImmediatePropagation();
      if(isBackIcon()){          /* app is showing ← (Global / Announcements): act as back */
        var h=document.getElementById('backHome');close();if(h)h.click();return;
      }
      toggle();return;
    }
    if(e.target===backdrop){close();return}
    /* the ← button in the drawer header goes home; close drawer too */
    if(e.target.closest&&e.target.closest('#backHome'))close();
    /* choosing a chat / room / DM inside the drawer closes it */
    if(isMobile()&&isOpen()){
      var sb=document.getElementById('sidebar');
      if(sb&&sb.contains(e.target)){
        var item=e.target.closest('#sbList > *, #sbList .item, #sbList button, #sbList [data-id], #sbList [data-room], #sbList [data-uid]');
        var skip=e.target.closest('.ms-markall,#sbFoot,input,textarea,select,summary');
        if(item&&!skip&&!item.matches('.sb-label,.sb-section,.sb-heading'))setTimeout(close,120);
      }
    }
  },true);

  /* Esc closes */
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});

  /* leaving mobile width resets state */
  (mq.addEventListener?mq.addEventListener.bind(mq,'change'):mq.addListener.bind(mq))(function(){close();queueSync()});

  /* swipe: right from left edge opens, left anywhere on drawer closes */
  var sx=0,sy=0,tracking=false;
  document.addEventListener('touchstart',function(e){
    if(!isMobile()||e.touches.length!==1)return;
    var t=e.touches[0];sx=t.clientX;sy=t.clientY;
    tracking=(!isOpen()&&sx<22)||isOpen();
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(!tracking)return;tracking=false;
    var t=e.changedTouches[0],dx=t.clientX-sx,dy=Math.abs(t.clientY-sy);
    if(dy>60||Math.abs(dx)<60)return;
    if(dx>0&&!isOpen())open();else if(dx<0&&isOpen())close();
  },{passive:true});

  /* keep the drawer closed whenever the user lands on a different page (home/auth) */
  var chatPage=document.getElementById('chatPage');
  if(chatPage&&window.MutationObserver){
    new MutationObserver(function(){if(chatPage.classList.contains('hidden'))close()})
      .observe(chatPage,{attributes:true,attributeFilter:['class']});
  }

  /* ---- Follow the app's own icon: ← means "back to main menu", anything else (☰) means drawer.
         We never rewrite the icon ourselves. ---- */
  var icEl=document.getElementById('menuBtnIcon');
  function isBackIcon(){
    var el=document.getElementById('menuBtnIcon');
    return !!el&&/^[\s]*[\u2190\u2b05\u2039\u25c0\u21a9\u2b60]/.test(el.textContent||'');
  }
  var syncPending=0;
  function syncBack(){
    syncPending=0;
    var b=isBackIcon();
    body.classList.toggle('ms-back',b);
    if(b)close();
  }
  function queueSync(){if(!syncPending)syncPending=requestAnimationFrame(syncBack)}
  syncBack();
  var mbtn=document.getElementById('menuBtn')||(icEl&&icEl.parentNode);
  if(mbtn&&window.MutationObserver)
    new MutationObserver(queueSync).observe(mbtn,{childList:true,subtree:true,characterData:true});
  if(chatPage&&window.MutationObserver)
    new MutationObserver(queueSync).observe(chatPage,{attributes:true,attributeFilter:['class']});

  /* ---- Mark all as read: find the button wherever the app renders it and restyle it ---- */
  function styleMarkAll(root){
    var els=(root||document).querySelectorAll('button,a,div[role="button"],span[role="button"]');
    for(var i=0;i<els.length;i++){
      var el=els[i];
      if(el.classList.contains('ms-markall')||el.classList.contains('markread-btn')||el.children.length>3)continue;   // .markread-btn (navigation.js) has its own styling + icon; restyling it here produced the doubled-check purple glitch
      var txt=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(/^(?:[^\w]*\s*)?mark all (as )?read\b/i.test(txt)&&txt.length<40){
        el.classList.add('ms-markall');
        el.textContent='Mark all as read';
      }
    }
  }
  styleMarkAll();
  var sbRoot=document.getElementById('sidebar')||document.body;
  var pending=0;
  new MutationObserver(function(){
    if(pending)return;
    pending=requestAnimationFrame(function(){pending=0;styleMarkAll(sbRoot)});
  }).observe(sbRoot,{childList:true,subtree:true});
})();
