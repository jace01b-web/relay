/* ==========================================================================
 * js/ui/auth-card-motion.js
 * Sign in / sign up card: smooth height + tab-switch animation
 * Plain (non-module) script that runs in place while the page is parsed - see its <script> tag in index.html.
 * ========================================================================== */
(function(){
  var card=document.getElementById('authCard'),page=document.getElementById('authPage'),
      up=document.getElementById('tabUp'),inb=document.getElementById('tabIn');
  if(!card||!up||!inb)return;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE='cubic-bezier(.22,1,.36,1)',prevH=card.offsetHeight,busy=false,pass=false,queued=null;
  if(window.ResizeObserver)new ResizeObserver(function(){if(!card.__anim)prevH=card.offsetHeight}).observe(card);

  /* card glides between the two forms' heights */
  function glide(from){
    var h=card.offsetHeight;
    if(reduce||!card.animate||!from||Math.abs(h-from)<2){prevH=h;return}
    if(card.__anim)card.__anim.cancel();
    card.style.overflow='hidden';
    var a=card.__anim=card.animate([{height:from+'px'},{height:h+'px'}],{duration:560,easing:EASE});
    var done=function(){if(card.__anim===a){card.__anim=null;card.style.overflow='';prevH=card.offsetHeight}};
    a.onfinish=done;a.oncancel=done;
  }
  var lastFlash=0,flashT;
  function flash(dir){
    if(reduce)return;
    lastFlash=Date.now();
    card.classList.remove('sw-r','sw-l');void card.offsetWidth;
    card.classList.add(dir>0?'sw-r':'sw-l');
    clearTimeout(flashT);flashT=setTimeout(function(){card.classList.remove('sw-r','sw-l')},1100);
  }
  /* runs after ANY tab change (our click path or the app's own authTab() calls) */
  function sync(){
    var t=up.classList.contains('active')?'up':'in';
    card.dataset.thumb=t;page.dataset.mood=t;
    if(card.dataset.tab===t)return;
    var from=prevH;card.dataset.tab=t;glide(from);
    if(Date.now()-lastFlash>700)flash(t==='up'?1:-1);
  }
  new MutationObserver(sync).observe(up,{attributes:true,attributeFilter:['class']});sync();

  function apply(btn){pass=true;btn.click();pass=false}
  /* outgoing content slides away first, then the app's own handler swaps forms and the new ones flow in */
  function go(want){
    if(busy){queued=want;return}
    if(want===card.dataset.tab)return;
    var btn=want==='up'?up:inb;
    if(reduce||!card.animate){apply(btn);return}
    busy=true;card.dataset.thumb=want;page.dataset.mood=want;
    var dir=want==='up'?1:-1;flash(dir);
    var outs=[].slice.call(card.querySelectorAll('#formIn,#formUp,.auth-head>*,.auth-switch')).filter(function(el){return el.offsetParent!==null});
    var anims=outs.map(function(el){
      var f=el.tagName==='FORM';
      return el.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateX('+(-dir*(f?28:12))+'px)'}],
        {duration:f?210:180,easing:'cubic-bezier(.5,0,.85,.35)',fill:'forwards'});
    });
    setTimeout(function(){apply(btn);anims.forEach(function(a){a.cancel()});busy=false;if(queued){var q=queued;queued=null;go(q)}},210);
  }
  card.addEventListener('click',function(e){
    if(pass)return;
    var g=e.target.closest('[data-go]'),tb=e.target.closest('#tabIn,#tabUp');
    var want=g?g.dataset.go:(tb?(tb.id==='tabUp'?'up':'in'):null);
    if(!want)return;
    e.stopPropagation();e.preventDefault();go(want);
  },true);
  card.addEventListener('click',function(e){
    var t=e.target.closest('.pw-toggle');
    if(t){var i=document.getElementById(t.dataset.for),show=i.type==='password';
      i.type=show?'text':'password';t.setAttribute('aria-pressed',show?'true':'false');
      t.setAttribute('aria-label',show?'Hide password':'Show password');i.focus()}
  });

  /* opening animation: plays every time the auth page appears (first visit, or after signing out) */
  var introT;
  function intro(){if(reduce)return;page.classList.add('intro');clearTimeout(introT);introT=setTimeout(function(){page.classList.remove('intro')},4500)}
  function watch(){
    var shown=!page.classList.contains('hidden');
    if(shown&&!page.__shown){page.__shown=true;intro()}
    else if(!shown){page.__shown=false;if(page.classList.contains('intro'))page.classList.remove('intro')}
  }
  new MutationObserver(watch).observe(page,{attributes:true,attributeFilter:['class']});watch();
})();
