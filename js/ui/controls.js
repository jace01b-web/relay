/* ==========================================================================
 * js/ui/controls.js
 * Custom sliders, dropdowns and colour picker
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Custom form controls (sliders + dropdowns) ---------- */
// Keeps the filled part of a range track in sync (WebKit needs a CSS var; Firefox has ::-moz-range-progress).
function syncRange(el){
  const min=+el.min||0,max=+el.max||100,v=+el.value;
  el.style.setProperty('--pct',((v-min)/(max-min||1)*100)+'%');
}
function enhanceRanges(scope){
  scope.querySelectorAll('input[type=range]').forEach(el=>{
    if(el._rng)return;el._rng=1;
    syncRange(el);
    el.addEventListener('input',()=>syncRange(el));
  });
}
// Replaces a native <select> with a styled dropdown. The real <select> stays in the DOM (hidden),
// so all existing code that reads/writes select.value and listens for 'input' keeps working.
function enhanceSelects(scope){
  scope.querySelectorAll('select').forEach(sel=>{
    if(sel._csel)return;sel._csel=1;
    const wrap=document.createElement('div');wrap.className='csel';
    sel.parentNode.insertBefore(wrap,sel);wrap.appendChild(sel);
    const btn=document.createElement('button');btn.type='button';btn.className='csel-btn';
    btn.innerHTML='<span class="csel-txt"></span><span class="chev"></span>';
    const menu=document.createElement('div');menu.className='csel-menu';menu.setAttribute('role','listbox');
    wrap.appendChild(btn);wrap.appendChild(menu);
    const txt=btn.querySelector('.csel-txt');
    let hl=-1;
    const opts=()=>[...menu.children];
    function build(){
      menu.innerHTML='';
      [...sel.options].forEach((o,i)=>{
        const d=document.createElement('div');d.className='csel-opt'+(o.selected?' sel':'');
        d.setAttribute('role','option');d.dataset.i=i;
        d.innerHTML='<span></span>';d.firstChild.textContent=o.textContent;
        d.onmousedown=e=>e.preventDefault();
        d.onclick=()=>{choose(i)};
        menu.appendChild(d);
      });
      txt.textContent=sel.options[sel.selectedIndex]?.textContent||'';
    }
    function choose(i){
      sel.selectedIndex=i;
      sel.dispatchEvent(new Event('input',{bubbles:true}));
      sel.dispatchEvent(new Event('change',{bubbles:true}));
      build();close();btn.focus();
    }
    function open(){
      // open upward if there isn't room below (the settings modal scrolls)
      const r=wrap.getBoundingClientRect();
      const box=(wrap.closest&&wrap.closest('.modal'))||null;
      const br=box?box.getBoundingClientRect():{top:0,bottom:window.innerHeight};
      const below=Math.min(window.innerHeight,br.bottom)-r.bottom-12;
      const above=r.top-Math.max(0,br.top)-12;
      const up=below<180&&above>below;
      wrap.classList.toggle('up',up);
      menu.style.maxHeight=Math.max(120,Math.min(240,up?above:below))+'px';
      wrap.classList.add('open');
      hl=sel.selectedIndex;paintHl();
      menu.querySelector('.sel')?.scrollIntoView({block:'nearest'});
    }
    function close(){wrap.classList.remove('open')}
    function paintHl(){opts().forEach((d,i)=>d.classList.toggle('hl',i===hl))}
    btn.onclick=()=>wrap.classList.contains('open')?close():open();
    btn.addEventListener('blur',()=>setTimeout(close,120));
    btn.addEventListener('keydown',e=>{
      const isOpen=wrap.classList.contains('open');
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();if(!isOpen){open();return}
        hl=Math.max(0,Math.min(sel.options.length-1,hl+(e.key==='ArrowDown'?1:-1)));paintHl();
        opts()[hl]?.scrollIntoView({block:'nearest'});
      }else if(e.key==='Enter'||e.key===' '){
        e.preventDefault();if(isOpen&&hl>=0)choose(hl);else open();
      }else if(e.key==='Escape'&&isOpen){e.preventDefault();e.stopPropagation();close()}
    });
    build();
    // Follow programmatic changes (code doing `select.value='x'`) by wrapping the value setter.
    const desc=(typeof HTMLSelectElement!=='undefined')&&Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
    if(desc&&desc.set){
      Object.defineProperty(sel,'value',{
        configurable:true,
        get(){return desc.get.call(sel)},
        set(v){desc.set.call(sel,v);build()}
      });
    }
  });
}


/* ---------- Custom color picker ----------
   Swaps every <input type="color"> for a styled swatch + popover (saturation/
   brightness square, hue slider, hex box, presets, eyedropper where supported).
   The original input stays in the DOM (hidden) and is kept in sync, so existing
   code that reads `.value` and listens for 'input' works unchanged. */
const CP_PRESETS=['#7c6cff','#ff6cb4','#ff5d73','#ffb84d','#4cd6a0','#4cc9f0','#ffffff','#111122',
                  '#5a4bff','#c77dff','#f72585','#ff9e00','#2dd4bf','#3b82f6','#9ca3af','#000000'];
const cpClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function cpHexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255]}
function cpRgbToHex(r,g,b){return'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')}
function cpRgbToHsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;
  if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360}
  return[h,mx?d/mx:0,mx]}
function cpHsvToRgb(h,s,v){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;
  if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];
  else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];
  return[(r+m)*255,(g+m)*255,(b+m)*255]}
function cpNormHex(v){v=String(v||'').trim().replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(v))v=v.split('').map(c=>c+c).join('');
  return/^[0-9a-f]{6}$/i.test(v)?'#'+v.toLowerCase():null}

// Curated single-tap banner presets — vivid, banner-friendly hues.
const BANNER_PRESETS=['#7c6cff','#ff6cb4','#ff5d73','#ffb84d','#ffd166','#4cd6a0',
                      '#10b981','#4cc9f0','#3b82f6','#c77dff','#f72585','#64748b'];
// One picked color -> a two-stop gradient with a little automatic depth, so a
// flat color swatch still reads as a proper banner instead of a solid block.
function bannerGradientColors(hex){
  const base=cpNormHex(hex)||safeColor(hex,'#7c6cff');
  const[h,s,v]=cpRgbToHsv(...cpHexToRgb(base));
  const h2=(h+32)%360,s2=Math.max(0,Math.min(1,s*.9)),v2=Math.max(0,Math.min(1,v*1.15+.06));
  return[base,cpRgbToHex(...cpHsvToRgb(h2,s2,v2))];
}
function bannerGradCss(hex){const[c1,c2]=bannerGradientColors(hex);return`linear-gradient(135deg,${c1},${c2})`}
// MVP image banners live in the public users/$id/style/banner as a small JPEG data URL. Only ever trust a strictly
// shaped data URL (no quotes/parens can sneak into the style attribute), and only show it while the person is still an MVP.
function isSafeBannerImg(s){return typeof s==='string'&&s.length>30&&s.length<=CFG.MVP_BANNER_MAX_CHARS&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s)}
function bannerImgOf(u){return(u&&u.banner&&isSafeBannerImg(u.banner)&&hasMvpPerks(u.id))?u.banner:''}
// CSS background for a profile banner: the MVP image if there is one, else the usual color gradient.
function bannerBg(u,hex){const img=bannerImgOf(u);return img?`url('${img}') center/cover no-repeat`:bannerGradCss(hex)}

function enhanceColors(scope){
  scope.querySelectorAll('input[type=color]').forEach(inp=>{
    if(inp._cp)return;inp._cp=1;
    const wrap=document.createElement('div');wrap.className='cpick';
    inp.parentNode.insertBefore(wrap,inp);wrap.appendChild(inp);
    const btn=document.createElement('button');btn.type='button';btn.className='cp-btn';
    btn.innerHTML='<span class="cp-sw"><i></i></span><span class="cp-hex"></span><span class="cp-name">Change</span>';
    const pop=document.createElement('div');pop.className='cp-pop';
    pop.innerHTML=`<div class="cp-sv"><div class="cp-knob"></div></div>
      <div class="cp-hue"><div class="cp-knob"></div></div>
      <div class="cp-row"><div class="cp-mini"></div><input class="cp-in" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex color">
        ${window.EyeDropper?'<button type="button" class="cp-eye" title="Pick a color from the screen">💧</button>':''}</div>
      <div class="cp-presets"></div>`;
    wrap.appendChild(btn);wrap.appendChild(pop);
    const $=s=>pop.querySelector(s);
    const sv=$('.cp-sv'),svK=sv.querySelector('.cp-knob'),hue=$('.cp-hue'),hueK=hue.querySelector('.cp-knob'),
          hexIn=$('.cp-in'),mini=$('.cp-mini'),presets=$('.cp-presets'),eye=$('.cp-eye');
    const swI=btn.querySelector('.cp-sw i'),hexTxt=btn.querySelector('.cp-hex');
    let h=0,s=0,v=1;
    const load=hex=>{[h,s,v]=cpRgbToHsv(...cpHexToRgb(cpNormHex(hex)||'#7c6cff'))};
    const hex=()=>cpRgbToHex(...cpHsvToRgb(h,s,v));
    function paint(skipInput){
      const c=hex();
      sv.style.setProperty('--h','hsl('+h+',100%,50%)');
      svK.style.left=(s*100)+'%';svK.style.top=((1-v)*100)+'%';svK.style.background=c;
      hueK.style.left=(h/360*100)+'%';hueK.style.background='hsl('+h+',100%,50%)';
      swI.style.background=c;mini.style.background=c;hexTxt.textContent=c;
      if(!skipInput){hexIn.value=c;hexIn.classList.remove('bad')}
      presets.querySelectorAll('.cp-preset').forEach(p=>p.classList.toggle('sel',p.dataset.c===c));
    }
    function commit(){
      const c=hex();
      if(inp.value!==c){inp.value=c;inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}))}
    }
    CP_PRESETS.forEach(c=>{const b=document.createElement('button');b.type='button';b.className='cp-preset';
      b.dataset.c=c;b.style.background=c;b.title=c;
      b.onclick=()=>{load(c);paint();commit()};presets.appendChild(b)});
    // drag helper (mouse + touch + pen)
    function drag(el,fn){
      const move=e=>{const r=el.getBoundingClientRect();fn(cpClamp((e.clientX-r.left)/r.width,0,1),cpClamp((e.clientY-r.top)/r.height,0,1));paint();commit()};
      el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);move(e);
        const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up)};
        el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up)});
    }
    drag(sv,(x,y)=>{s=x;v=1-y});
    drag(hue,x=>{h=x*360;if(h>=360)h=359.99});
    hexIn.addEventListener('input',()=>{
      const n=cpNormHex(hexIn.value);
      if(n){load(n);paint(true);hexIn.classList.remove('bad');commit()}else hexIn.classList.add('bad');
    });
    hexIn.addEventListener('blur',()=>{hexIn.value=hex();hexIn.classList.remove('bad')});
    if(eye)eye.onclick=async()=>{try{const r=await new EyeDropper().open();load(r.sRGBHex);paint();commit()}catch(_){}};
    // open / close
    function place(){
      const r=wrap.getBoundingClientRect(),box=wrap.closest('.modal'),
            br=box?box.getBoundingClientRect():{top:0,bottom:innerHeight,right:innerWidth};
      const below=Math.min(innerHeight,br.bottom)-r.bottom,above=r.top-Math.max(0,br.top);
      wrap.classList.toggle('up',below<330&&above>below);
      wrap.classList.toggle('right',r.left+248>Math.min(innerWidth,br.right)-8);
    }
    function open(){document.querySelectorAll('.cpick.open').forEach(o=>o!==wrap&&o.classList.remove('open'));
      load(inp.value);paint();place();wrap.classList.add('open')}
    function close(){wrap.classList.remove('open')}
    btn.onclick=()=>wrap.classList.contains('open')?close():open();
    document.addEventListener('pointerdown',e=>{if(wrap.classList.contains('open')&&!wrap.contains(e.target))close()},true);
    wrap.addEventListener('keydown',e=>{if(e.key==='Escape'&&wrap.classList.contains('open')){e.preventDefault();e.stopPropagation();close();btn.focus()}});
    // follow programmatic changes to inp.value (e.g. Reset)
    const desc=(typeof HTMLInputElement!=='undefined')&&Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    if(desc&&desc.set)Object.defineProperty(inp,'value',{configurable:true,get(){return desc.get.call(inp)},
      set(x){desc.set.call(inp,x);load(x);paint()}});
    load(inp.value);paint();
  });
}
