/* ==========================================================================
 * js/chat/attachments.js
 * Image attachments: compress, crop avatar, previews, paste
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

$('#ccClose').onclick=cancelCompose;

/* Images */
/* "+" button: with Discord look it opens a small menu (Upload a File);
   with it off it still opens the image picker directly, like before. */
const plusMenu=$('#plusMenu');
const dlOn=()=>typeof DiscordLook!=='undefined'&&DiscordLook.on();
function closePlusMenu(){if(plusMenu)plusMenu.classList.add('hidden');$('#attachBtn').setAttribute('aria-expanded','false')}
$('#attachBtn').onclick=e=>{
  if(!dlOn()||!plusMenu){$('#fileIn').click();return}
  e.stopPropagation();
  const open=plusMenu.classList.contains('hidden');
  plusMenu.classList.toggle('hidden',!open);
  $('#attachBtn').setAttribute('aria-expanded',open?'true':'false');
};
document.addEventListener('click',e=>{
  if(!plusMenu||plusMenu.classList.contains('hidden'))return;
  if(e.target.closest&&(e.target.closest('#plusMenu')||e.target.closest('#attachBtn')))return;
  closePlusMenu();
});
// capture phase + preventDefault so the global Escape handler doesn't also leave the chat
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&plusMenu&&!plusMenu.classList.contains('hidden')){e.preventDefault();e.stopPropagation();closePlusMenu()}
},true);
$('#plusUpload').onclick=()=>{closePlusMenu();$('#fileIn').click()};

$('#emojiBtn').onclick=()=>{
  openEmojiPicker($('#emojiBtn'),emoji=>{
    const pos=msgIn.selectionStart??msgIn.value.length;
    msgIn.value=msgIn.value.slice(0,pos)+emoji+msgIn.value.slice(pos);
    msgIn.focus();const np=pos+emoji.length;msgIn.setSelectionRange(np,np);
    msgIn.style.height='auto';msgIn.style.height=Math.min(msgIn.scrollHeight,140)+'px';
    $('#cc').textContent=msgIn.value.length;
  });
};
// Everything picked / pasted / dropped lands here. Normal pictures are compressed into the message itself
// (old path); GIFs, videos, audio, text files and everything else go to Firebase Storage (file-upload.js).
async function addPickedFiles(files){
  for(const f of files){
    const kind=FILES.kindOf(f);
    if(kind==='image'){
      if(view.pending.length>=CFG.MAX_IMAGES){toast(`Max ${CFG.MAX_IMAGES} images per message.`,'bad');continue}
      if(f.size>CFG.MAX_IMG_BYTES){toast(`${f.name} is too large (max 8MB).`,'bad');continue}
      try{view.pending.push(await compressImage(f))}
      catch(err){toast(err.message||`${f.name} could not be processed.`,'bad')}
    }else{
      view.pendingFiles=view.pendingFiles||[];
      FILES.add(f,view.pendingFiles,renderPreviews);
    }
  }
  renderPreviews();
}
$('#fileIn').onchange=async e=>{
  const files=[...e.target.files];e.target.value='';
  await addPickedFiles(files);
};
// Iteratively shrinks dimensions/quality until the encoded data URL is safely
// under the database's per-field size limit. RTDB rejects oversized writes
// outright (PERMISSION_DENIED, indistinguishable client-side from an auth
// problem) — so we can't just trust one pass at fixed max/q. Mutates and
// returns the canvas's own data URL, or null if it still won't fit.
// Shared by compressImage and the avatar cropper below.
function shrinkCanvasToLimit(c,q){
  let dims={w:c.width,h:c.height},quality=q,out=c.toDataURL('image/jpeg',quality);
  let attempts=0;
  while(out.length>CFG.MAX_IMG_DATAURL_CHARS&&attempts<8){
    attempts++;
    if(quality>0.5){quality=Math.max(0.5,quality-0.12)}
    else{dims={w:Math.max(1,Math.round(dims.w*0.8)),h:Math.max(1,Math.round(dims.h*0.8))};
      const c2=document.createElement('canvas');c2.width=dims.w;c2.height=dims.h;
      c2.getContext('2d').drawImage(c,0,0,dims.w,dims.h);
      c.width=dims.w;c.height=dims.h;c.getContext('2d').drawImage(c2,0,0);
    }
    out=c.toDataURL('image/jpeg',quality);
  }
  return out.length>CFG.MAX_IMG_DATAURL_CHARS?null:out;
}
function compressImage(file,max=1280,q=.82){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const s=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        const out=shrinkCanvasToLimit(c,q);
        if(!out){rej(new Error('Image is still too large after compression — try a smaller photo.'));return}
        res(out);
      };
      img.onerror=()=>rej(new Error('Could not read that image file.'));
      img.src=r.result;
    };
    r.onerror=()=>rej(new Error('Could not read that image file.'));
    r.readAsDataURL(file);
  });
}
// ---------- Avatar cropper ----------
// Circular drag-to-pan / scroll-to-zoom cropper shown right after picking a
// profile picture, so people can frame it before it saves instead of getting
// whatever square crop the browser happened to give the source photo.
function openAvatarCropper(file){
  const url=URL.createObjectURL(file);
  const root=$('#modalRoot');
  const STAGE=260;
  root.innerHTML=`<div class="modal-bg" id="cropBg"><div class="modal crop-modal">
    <h2>Crop picture</h2>
    <div class="hint">Drag to reposition, scroll or use the slider to zoom.</div>
    <div class="crop-stage" id="cropStage"><img id="cropImg" src="${url}" draggable="false" alt=""></div>
    <input type="range" id="cropZoom" min="1" max="3" step="0.01" value="1">
    <div class="err" id="cropErr"></div>
    <div class="actions"><button class="btn sec" id="cropCancel">Cancel</button><button class="btn" id="cropSave">Save</button></div>
  </div></div>`;
  const stage=$('#cropStage'),img=$('#cropImg'),zoomEl=$('#cropZoom');
  const st={baseScale:1,natW:0,natH:0,x:0,y:0,scale:1};
  const clamp=()=>{
    const w=st.natW*st.scale,h=st.natH*st.scale;
    const maxX=Math.max(0,(w-STAGE)/2),maxY=Math.max(0,(h-STAGE)/2);
    st.x=Math.max(-maxX,Math.min(maxX,st.x));
    st.y=Math.max(-maxY,Math.min(maxY,st.y));
  };
  const paint=()=>{img.style.transform=`translate(calc(-50% + ${st.x}px), calc(-50% + ${st.y}px)) scale(${st.scale})`};
  img.onload=()=>{
    st.natW=img.naturalWidth;st.natH=img.naturalHeight;
    // cover the square the circle is inscribed in, at zoom=1
    st.baseScale=STAGE/Math.max(1,Math.min(st.natW,st.natH));
    st.scale=st.baseScale;st.x=0;st.y=0;
    img.style.width=st.natW+'px';img.style.height=st.natH+'px';
    clamp();paint();
  };
  img.onerror=()=>{$('#cropErr').textContent='Could not read that image file.'};
  let dragging=false,startX=0,startY=0,ox=0,oy=0;
  const down=e=>{
    dragging=true;
    const p=e.touches?e.touches[0]:e;startX=p.clientX;startY=p.clientY;ox=st.x;oy=st.y;
    e.preventDefault();
  };
  const move=e=>{
    if(!dragging)return;
    const p=e.touches?e.touches[0]:e;
    st.x=ox+(p.clientX-startX);st.y=oy+(p.clientY-startY);
    clamp();paint();
  };
  const up=()=>{dragging=false};
  const wheel=e=>{
    e.preventDefault();
    const v=Math.max(1,Math.min(3,parseFloat(zoomEl.value)-e.deltaY*0.0015));
    zoomEl.value=v;st.scale=st.baseScale*v;clamp();paint();
  };
  stage.addEventListener('pointerdown',down);
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',up);
  stage.addEventListener('wheel',wheel,{passive:false});
  zoomEl.oninput=()=>{st.scale=st.baseScale*parseFloat(zoomEl.value);clamp();paint()};
  const teardown=()=>{
    stage.removeEventListener('pointerdown',down);
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',up);
    URL.revokeObjectURL(url);
  };
  $('#cropCancel').onclick=()=>{teardown();openAccount()};
  $('#cropBg').onclick=e=>{if(e.target.id==='cropBg'){teardown();openAccount()}};
  $('#cropSave').onclick=async()=>{
    $('#cropErr').textContent='';
    try{
      const w=st.natW*st.scale,h=st.natH*st.scale;
      const tlX=STAGE/2+st.x-w/2,tlY=STAGE/2+st.y-h/2;
      const srcX=Math.max(0,-tlX/st.scale),srcY=Math.max(0,-tlY/st.scale);
      const srcSize=Math.min(STAGE/st.scale,st.natW-srcX,st.natH-srcY);
      const c=document.createElement('canvas');c.width=480;c.height=480;
      c.getContext('2d').drawImage(img,srcX,srcY,srcSize,srcSize,0,0,480,480);
      const out=shrinkCanvasToLimit(c,.9);
      if(!out)throw new Error('Image is still too large after compression — try a smaller photo.');
      teardown();
      await DB.updateSettings(ME.id,{avatar:out});
      ME=DB.currentUser();
      openAccount(); // re-render with the new picture + Remove button
    }catch(e){$('#cropErr').textContent='Could not save: '+(e.code||e.message)}
  };
}
function renderPreviews(){
  const p=$('#previews');p.innerHTML='';
  view.pending.forEach((s,i)=>{
    const d=document.createElement('div');d.className='pv';
    d.innerHTML=`<img src="${s}"><button>✕</button>`;
    d.querySelector('button').onclick=()=>{view.pending.splice(i,1);renderPreviews()};
    p.appendChild(d);
  });
  FILES.renderChips(p,view.pendingFiles||[],renderPreviews);   // uploaded / uploading files (gif, video, text, ...)
}
msgIn.addEventListener('paste',async e=>{
  const files=[...(e.clipboardData?.files||[])];
  if(!files.length)return;e.preventDefault();
  await addPickedFiles(files);
});
