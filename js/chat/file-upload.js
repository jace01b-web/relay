/* ==========================================================================
 * js/chat/file-upload.js
 * File attachments through Firebase Storage: GIFs, videos, audio, text files, PDFs, zips, ...
 *
 * How it works
 *   1. The user picks / pastes / drops a file. It is validated and uploaded to Firebase Storage
 *      straight away (chat/<uid>/<id>_<name>) with a progress bar in the composer.
 *   2. When the message is sent, only a tiny descriptor goes into the Realtime Database:
 *        files:[{url,name,size,type,kind,preview?}]   (kind = gif | video | audio | text | file)
 *   3. Messages draw the file by kind: <img> for GIFs, <video controls>, <audio controls>, or a
 *      file card (name, size, snippet, Download) for text files and everything else.
 *
 * Normal (non-GIF) pictures keep using the old compress-to-database path in attachments.js.
 * Needs: storage.rules + the `files` rule in database.rules.json (see SETUP-FILES.md).
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * ========================================================================== */
'use strict';

const _MB=1024*1024;
const FILES={
  MAX:5,                                   // files per message (the database rule allows indexes 0-4)
  LIMITS:{gif:50*_MB,video:50*_MB,audio:50*_MB,text:50*_MB,file:50*_MB},   // keep <= the size cap in storage.rules
  PREVIEW_CHARS:400,                       // snippet stored in the message for text files
  BASE:'https://firebasestorage.googleapis.com/v0/b/'+firebaseConfig.storageBucket+'/o/chat%2F',
  // file types we can send. Anything else is refused.
  TEXT_EXT:'txt md log csv tsv json jsonl xml yml yaml ini cfg conf toml env js mjs cjs ts tsx jsx py java c h cpp hpp cs go rs rb php sh bat ps1 sql html htm css scss lua kt swift r tex srt vtt'.split(' '),
  AUDIO_MIME:{mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',weba:'audio/webm'},
  VIDEO_MIME:{mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime'},
  // never uploaded: things that run on someone's computer when opened
  BLOCKED_EXT:'exe msi bat cmd com scr pif vbs vbe wsf wsh ps1 psm1 jar apk app dmg pkg deb rpm dll sys lnk reg hta cpl'.split(' '),
  ICONS:{text:'📄',file:'📎',audio:'🎵',video:'🎞️',gif:'🖼️'},
  _seq:0
};
// Storage loads in the background (loader.js sets window.FBS); looked up lazily so it can never break startup.
let _stor_v;
function _stor(){
  if(_stor_v)return _stor_v;
  try{if(window.FBS&&window.FBS.getStorage)_stor_v=window.FBS.getStorage(fbApp)}catch(e){console.warn('storage init failed',e)}
  return _stor_v||null;
}

const fileExt=n=>{const m=/\.([A-Za-z0-9]{1,8})$/.exec(String(n||''));return m?m[1].toLowerCase():''};
function fmtBytes(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<_MB)return (n/1024).toFixed(n<10240?1:0)+' KB';return (n/_MB).toFixed(n<10*_MB?1:0)+' MB'}
function cleanFileName(n){
  n=String(n||'file').replace(/[\u0000-\u001f\u007f\\\/]+/g,'_').replace(/\s+/g,' ').trim();
  if(!n)n='file';
  if(n.length>120){const e=fileExt(n);n=n.slice(0,100)+(e?'.'+e:'')}
  return n;
}

/* what is this file? -> 'image' (old compress path) | gif | video | audio | text | file | null (refuse) */
FILES.kindOf=function(f){
  const t=(f.type||'').toLowerCase(),e=fileExt(f.name);
  if(FILES.BLOCKED_EXT.includes(e))return null;
  if(t==='image/gif'||e==='gif')return 'gif';
  if(t.startsWith('image/'))return 'image';
  if(FILES.VIDEO_MIME[e]||t==='video/mp4'||t==='video/webm'||t==='video/quicktime')return 'video';
  if(FILES.AUDIO_MIME[e]||t.startsWith('audio/'))return 'audio';
  if(t.startsWith('text/')||FILES.TEXT_EXT.includes(e)||t==='application/json'||t==='application/xml'||t==='application/javascript')return 'text';
  return 'file';
};
// the contentType we upload with. The storage rules only accept this exact list.
FILES.mimeFor=function(f,kind){
  const t=(f.type||'').toLowerCase(),e=fileExt(f.name);
  if(kind==='gif')return 'image/gif';
  if(kind==='video')return FILES.VIDEO_MIME[e]||(['video/mp4','video/webm','video/quicktime'].includes(t)?t:'video/mp4');
  if(kind==='audio')return FILES.AUDIO_MIME[e]||(Object.values(FILES.AUDIO_MIME).includes(t)?t:'audio/mpeg');
  if(kind==='text')return 'text/plain';           // never text/html: nothing uploaded here may render as a web page
  return e==='pdf'?'application/pdf':'application/octet-stream';
};

/* ---------- where do files go? Cloudinary (free, no card) if configured, otherwise Firebase Storage ---------- */
FILES.useCloud=()=>!!(CFG.CLOUDINARY_CLOUD&&CFG.CLOUDINARY_PRESET);
FILES.CLOUD_BASE='https://res.cloudinary.com/';
FILES.CLOUD_LIMITS={gif:10*_MB,video:50*_MB,audio:50*_MB,text:10*_MB,file:10*_MB};   // Cloudinary free plan: 10 MB for images/raw files, 100 MB video
FILES.limitFor=k=>(FILES.useCloud()?FILES.CLOUD_LIMITS:FILES.LIMITS)[k];
FILES.isCloudUrl=u=>typeof u==='string'&&u.startsWith(FILES.CLOUD_BASE);
// the "Download" link: Cloudinary can force a download with fl_attachment
FILES.dlUrl=u=>FILES.isCloudUrl(u)?u.replace('/upload/','/upload/fl_attachment/'):u;

/* ---------- is this person allowed to upload right now? -> reason string, or '' ---------- */
FILES.blockReason=function(){
  if(!FILES.useCloud()&&!_stor())return 'File uploads are unavailable (Firebase Storage could not load).';
  if(typeof ME==='undefined'||!ME||!auth.currentUser)return 'Log in to upload files.';
  if(DB.isBanned(ME.id))return 'Your account has been banned.';
  if(DB.isMuted(ME.id))return 'You are muted and cannot send files right now.';
  try{const br=(typeof chatBlockReason==='function')?chatBlockReason():null;if(br)return br}catch(_){}
  return '';
};

/* ---------- frames for the NSFW scan (GIF first frame / 3 spots in a video) ---------- */
function _drawFrame(src,w,h){
  const s=Math.min(1,512/Math.max(w,h,1)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));
  c.getContext('2d').drawImage(src,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.7);
}
FILES.frames=function(file,kind){
  return new Promise(res=>{
    const url=URL.createObjectURL(file),out=[];
    let finished=false;
    const done=()=>{if(finished)return;finished=true;URL.revokeObjectURL(url);res(out)};
    setTimeout(done,8000);
    try{
      if(kind==='gif'){
        const img=new Image();
        img.onload=()=>{try{out.push(_drawFrame(img,img.naturalWidth,img.naturalHeight))}catch(_){}done()};
        img.onerror=done;img.src=url;
      }else if(kind==='video'){
        const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';
        const marks=[.1,.5,.9];let i=0;
        const next=()=>{
          if(i>=marks.length)return done();
          v.currentTime=Math.max(0,(v.duration||1)*marks[i++]);
        };
        v.onloadeddata=next;
        v.onseeked=()=>{try{if(v.videoWidth)out.push(_drawFrame(v,v.videoWidth,v.videoHeight))}catch(_){}next()};
        v.onerror=done;v.src=url;
      }else done();
    }catch(_){done()}
  });
};

/* ---------- adding + uploading ---------- */
// bag = an array of pending entries (view.pendingFiles). rerender = redraws that composer's preview strip.
FILES.add=function(file,bag,rerender){
  const kind=FILES.kindOf(file);
  const e=fileExt(file.name);
  if(kind===null){toast(`.${e||'that'} files can't be sent here (they could run on someone's computer).`,'bad');return}
  if(kind==='image'){toast('Use the normal image path for pictures.','bad');return}
  if(FILES.useCloud()&&['html','htm','svg','xhtml'].includes(e)){toast('Rename web-page files to .txt to send them.','bad');return}
  if(bag.length>=FILES.MAX){toast(`Max ${FILES.MAX} files per message.`,'bad');return}
  const lim=FILES.limitFor(kind);
  if(file.size>lim){toast(`${file.name} is too large (max ${fmtBytes(lim)} for ${kind==='file'?'files':kind==='gif'?'GIFs':kind+' files'}).`,'bad');return}
  if(!file.size){toast(`${file.name} is empty.`,'bad');return}
  const why=FILES.blockReason();
  if(why){toast(why,'bad');return}
  if(typeof view!=='undefined'&&view.roomKey===CFG.ANNOUNCEMENTS_ROOM&&!isOwner(ME.id)){toast('Only the owner can post announcements.','bad');return}
  if(typeof view!=='undefined'&&view.roomKey===CFG.SHITPOST_ROOM&&!isStaff(ME.id)){toast('Only mods, admins and owners can post in #shitpost.','bad');return}

  const ent={id:++FILES._seq,file,name:cleanFileName(file.name),size:file.size,kind,type:FILES.mimeFor(file,kind),
    state:'uploading',progress:0,url:'',path:'',task:null,preview:'',frames:[],thumb:'',el:null,bag};
  bag.push(ent);
  // snippet for text files + frames to scan for gif/video (both done in the background)
  if(kind==='text'){
    file.slice(0,4000).text().then(t=>{
      t=t.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').slice(0,FILES.PREVIEW_CHARS);
      if(t.trim())ent.preview=t;
    }).catch(()=>{});
  }
  if(kind==='gif'||kind==='video'){
    FILES.frames(file,kind).then(fr=>{ent.frames=fr;ent.thumb=fr[0]||'';if(ent.thumb&&ent.el&&ent.state!=='removed')rerender()});
  }
  FILES._upload(ent,rerender);
  rerender();
};
// ---- Cloudinary (unsigned upload from the browser; the preset decides folder/limits) ----
FILES._uploadCloud=function(ent){
  return new Promise((ok,bad)=>{
    const rt=ent.kind==='gif'?'image':(ent.kind==='video'||ent.kind==='audio')?'video':'raw';   // Cloudinary files audio under "video"
    const fd=new FormData();
    fd.append('file',ent.file);fd.append('upload_preset',CFG.CLOUDINARY_PRESET);
    const xhr=new XMLHttpRequest();
    ent.task={cancel:()=>xhr.abort()};
    xhr.open('POST',`https://api.cloudinary.com/v1_1/${encodeURIComponent(CFG.CLOUDINARY_CLOUD)}/${rt}/upload`);
    xhr.upload.onprogress=e=>{if(e.lengthComputable){ent.progress=e.loaded/e.total;FILES._paintChip(ent)}};
    xhr.onload=()=>{
      let j={};try{j=JSON.parse(xhr.responseText)}catch(_){}
      if(xhr.status>=200&&xhr.status<300&&j.secure_url){ent.url=j.secure_url;ent.deleteToken=j.delete_token||'';ok()}
      else bad({code:'cloud/'+xhr.status,message:(j.error&&j.error.message)||('Upload failed ('+xhr.status+')')});
    };
    xhr.onerror=()=>bad({code:'cloud/network',message:'Network problem (is Cloudinary blocked on this network?)'});
    xhr.onabort=()=>bad({code:'storage/canceled'});
    xhr.send(fd);
  });
};
// only possible if the preset has "Return delete token" on (valid ~10 minutes) - best effort
FILES._cloudDelete=function(ent){
  if(!ent.deleteToken||!CFG.CLOUDINARY_CLOUD)return;
  try{fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CFG.CLOUDINARY_CLOUD)}/delete_by_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:ent.deleteToken})}).catch(()=>{})}catch(_){}
};
FILES._upload=async function(ent,rerender){
  if(FILES.useCloud()){
    try{
      if(typeof tosGateGuard==='function')await tosGateGuard();
      await FILES._uploadCloud(ent);
      if(ent.state==='removed'){FILES._cloudDelete(ent);return}
      ent.state='done';ent.progress=1;ent.task=null;
    }catch(err){
      if(ent.state==='removed')return;
      ent.state='error';ent.task=null;
      ent.error=err&&err.code==='storage/canceled'?'Cancelled':(err&&err.message)||'Upload failed';
      if(err&&String(err.code).startsWith('cloud/4'))toast('Cloudinary refused the upload: '+ent.error+'. Check the cloud name / unsigned preset in config.js.','bad');
    }
    rerender();return;
  }
  try{
    if(typeof tosGateGuard==='function')await tosGateGuard();
    const S=window.FBS;
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
    ent.path=`chat/${auth.currentUser.uid}/${id}_${ent.name.replace(/[^\w.\- ]+/g,'_').replace(/\s+/g,'_').slice(-80)}`;
    const meta={contentType:ent.type,cacheControl:'public,max-age=31536000'};
    // text + other files always download instead of opening as a page; gif/video/audio must stay inline
    if(ent.kind==='text'||ent.kind==='file')meta.contentDisposition='attachment; filename*=UTF-8\'\''+encodeURIComponent(ent.name);
    const r=S.ref(_stor(),ent.path);
    ent.task=S.uploadBytesResumable(r,ent.file,meta);
    await new Promise((ok,bad)=>{
      ent.task.on('state_changed',s=>{
        ent.progress=s.totalBytes?s.bytesTransferred/s.totalBytes:0;
        FILES._paintChip(ent);
      },bad,ok);
    });
    if(ent.state==='removed'){S.deleteObject(r).catch(()=>{});return}
    ent.url=await S.getDownloadURL(r);
    ent.state='done';ent.progress=1;ent.task=null;
  }catch(err){
    if(ent.state==='removed')return;
    ent.state='error';ent.task=null;
    const c=err&&err.code;
    ent.error=c==='storage/unauthorized'?'Not allowed (rules / file type / size)':c==='storage/canceled'?'Cancelled':c==='storage/retry-limit-exceeded'?'Network problem':(c||err.message||'Upload failed');
    if(c==='storage/unauthorized')toast('Upload was refused by Firebase Storage. If this keeps happening, the Storage rules from SETUP-FILES.md still need to be published.','bad');
  }
  rerender();
};

/* remove one entry (cancel the upload / delete the object that was already uploaded) */
FILES.remove=function(ent,rerender){
  const was=ent.state;ent.state='removed';
  try{if(ent.task)ent.task.cancel()}catch(_){}
  if(was==='done'&&ent.path){try{window.FBS.deleteObject(window.FBS.ref(_stor(),ent.path)).catch(()=>{})}catch(_){}}
  if(was==='done'&&ent.deleteToken)FILES._cloudDelete(ent);
  const i=ent.bag.indexOf(ent);if(i!==-1)ent.bag.splice(i,1);
  rerender();
};
// drop everything that was never sent (room switch, leaving the chat, ...)
FILES.discard=function(bag){
  (bag||[]).slice().forEach(e=>{
    const was=e.state;e.state='removed';
    try{if(e.task)e.task.cancel()}catch(_){}
    if(was==='done'&&e.path){try{window.FBS.deleteObject(window.FBS.ref(_stor(),e.path)).catch(()=>{})}catch(_){}}
    if(was==='done'&&e.deleteToken)FILES._cloudDelete(e);
  });
  if(bag)bag.length=0;
};
function clearPendingFiles(){if(typeof view!=='undefined'){FILES.discard(view.pendingFiles);view.pendingFiles=[]}}

/* what goes into the message */
FILES.payload=function(bag){
  return (bag||[]).filter(e=>e.state==='done'&&e.url).slice(0,FILES.MAX).map(e=>{
    const o={url:e.url,name:e.name,size:e.size,kind:e.kind};
    if(e.kind==='text'&&e.preview)o.preview=e.preview;
    return o;
  });
};
// shared "can I send this bag right now?" check -> error string or ''
FILES.sendProblem=function(bag){
  if((bag||[]).some(e=>e.state==='uploading'))return 'Still uploading — wait for the bar to finish.';
  if((bag||[]).some(e=>e.state==='error'))return 'A file failed to upload. Remove it (✕) and try again.';
  return '';
};
// NSFW scan of every gif/video frame; true = flagged
FILES.anyFlagged=async function(bag){
  if(typeof NSFW==='undefined'||!NSFW.on())return false;
  const fr=[];(bag||[]).forEach(e=>(e.frames||[]).forEach(f=>fr.push(f)));
  return fr.length?NSFW.anyFlagged(fr):false;
};
// delete uploaded objects by their download URL (only works for the uploader - see storage.rules)
FILES.pathOf=function(url){
  try{if(!FILES.safeUrl(url)||FILES.isCloudUrl(url))return '';const p=url.slice(FILES.BASE.length-('chat%2F'.length)).split('?')[0];return decodeURIComponent(p)}catch(_){return ''}
};
FILES.deleteUrls=function(files){
  if(!window.FBS||!_stor())return;
  (files||[]).forEach(f=>{
    const p=FILES.pathOf(f&&f.url);
    if(p&&ME&&auth.currentUser&&p.startsWith('chat/'+auth.currentUser.uid+'/')){try{window.FBS.deleteObject(window.FBS.ref(_stor(),p)).catch(()=>{})}catch(_){}}
  });
};
// used by DB.sendMessage so a tampered client can't smuggle odd data in
FILES.clean=function(files){
  return (Array.isArray(files)?files:[]).map(FILES.safe).filter(Boolean).slice(0,FILES.MAX);
};

/* ---------- composer preview chips ---------- */
FILES._paintChip=function(ent){
  const el=ent.el;if(!el)return;
  const sub=el.querySelector('.fa-chip-sub'),bar=el.querySelector('.fa-bar i');
  if(sub)sub.textContent=ent.state==='error'?(ent.error||'Failed'):fmtBytes(ent.size)+(ent.state==='uploading'?' · '+Math.round(ent.progress*100)+'%':' · ready');
  if(bar)bar.style.width=Math.round(ent.progress*100)+'%';
};
FILES.renderChips=function(host,bag,rerender){
  if(!host)return;
  host.querySelectorAll('.fa-chip').forEach(n=>n.remove());
  (bag||[]).forEach(ent=>{
    const d=document.createElement('div');d.className='fa-chip '+ent.state;
    const ic=document.createElement('div');ic.className='fa-chip-ic';
    if(ent.thumb){const im=document.createElement('img');im.src=ent.thumb;im.alt='';ic.appendChild(im)}else ic.textContent=FILES.ICONS[ent.kind]||'📎';
    const main=document.createElement('div');main.className='fa-chip-main';
    const nm=document.createElement('div');nm.className='fa-chip-name';nm.textContent=ent.name;
    const sub=document.createElement('div');sub.className='fa-chip-sub';
    const bar=document.createElement('div');bar.className='fa-bar';bar.appendChild(document.createElement('i'));
    main.append(nm,sub,bar);
    const x=document.createElement('button');x.type='button';x.className='fa-chip-x';x.textContent='✕';x.title=ent.state==='uploading'?'Cancel upload':'Remove';
    x.onclick=()=>FILES.remove(ent,rerender);
    d.append(ic,main,x);
    host.appendChild(d);
    ent.el=d;FILES._paintChip(ent);
  });
};

/* ---------- drawing files inside messages ---------- */
// URL must be one of OUR Storage download links - anything else is dropped (no javascript:, no outside hosts)
FILES.safeUrl=u=>typeof u==='string'&&u.length<800&&((u.startsWith(FILES.BASE)&&/^[A-Za-z0-9%._~\-?&=]+$/.test(u.slice(FILES.BASE.length)))||(u.startsWith(FILES.CLOUD_BASE)&&/^[A-Za-z0-9%._~\-\/]+$/.test(u.slice(FILES.CLOUD_BASE.length))));
FILES.safe=function(f){
  if(!f||typeof f!=='object'||!FILES.safeUrl(f.url))return null;
  const kind=['gif','video','audio','text','file'].includes(f.kind)?f.kind:'file';
  return{url:f.url,kind,name:cleanFileName(f.name),size:Number(f.size)||0,preview:typeof f.preview==='string'?f.preview.slice(0,FILES.PREVIEW_CHARS+100):''};
};
function filesHTML(list){
  const fs=FILES.clean(list);
  if(!fs.length)return '';
  // NOTE: bubbles use white-space:pre-wrap, so this markup is deliberately written without line breaks
  return '<div class="fa-wrap">'+fs.map(f=>{
    const u=esc(f.url),n=esc(f.name),sz=fmtBytes(f.size);
    if(f.kind==='gif')return `<div class="fa-media"><img class="fa-gif" src="${u}" alt="${n}" loading="lazy" decoding="async" data-fa="zoom"><span class="fa-badge">GIF</span></div>`;
    if(f.kind==='video')return `<div class="fa-media"><video class="fa-video" src="${u}" controls preload="metadata" playsinline></video><a class="fa-dl-mini" href="${esc(FILES.dlUrl(f.url))}" target="_blank" rel="noopener noreferrer" title="Open / download ${n}">⬇</a></div>`;
    if(f.kind==='audio')return `<div class="fa-card"><div class="fa-row"><div class="fa-ic">🎵</div><div class="fa-info"><div class="fa-name" title="${n}">${n}</div><div class="fa-meta">${sz}</div></div><a class="fa-btn" href="${esc(FILES.dlUrl(f.url))}" target="_blank" rel="noopener noreferrer">Download</a></div><audio class="fa-audio" src="${u}" controls preload="none"></audio></div>`;
    const ext=(fileExt(f.name)||(f.kind==='text'?'txt':'file')).toUpperCase();
    const snip=f.kind==='text'&&f.preview?`<pre class="fa-snippet" data-fa-full="${u}">${esc(f.preview)}${f.size>FILES.PREVIEW_CHARS?'…':''}</pre>`:'';
    const more=(f.kind==='text'&&f.size>FILES.PREVIEW_CHARS)?`<button type="button" class="fa-btn sec" data-fa="expand">Show more</button>`:'';
    return `<div class="fa-card"><div class="fa-row"><div class="fa-ic">${FILES.ICONS[f.kind]}</div><div class="fa-info"><div class="fa-name" title="${n}">${n}</div><div class="fa-meta">${ext} · ${sz}</div></div>${more}<a class="fa-btn" href="${esc(FILES.dlUrl(f.url))}" target="_blank" rel="noopener noreferrer" download="${n}">Download</a></div>${snip}</div>`;
  }).join('')+'</div>';
}
// short text used in reply previews, ping toasts, search results
function filesLabel(files){
  const fs=FILES.clean(files);if(!fs.length)return '';
  if(fs.length===1){const f=fs[0];return (f.kind==='gif'?'🖼️ GIF':f.kind==='video'?'🎞️ Video':f.kind==='audio'?'🎵 Audio':'📎 ')+(f.kind==='gif'||f.kind==='video'||f.kind==='audio'?'':f.name)}
  return '📎 '+fs.length+' files';
}

/* one delegated handler for every message (the message list re-renders constantly) */
document.addEventListener('click',async e=>{
  const t=e.target.closest&&e.target.closest('[data-fa]');if(!t)return;
  const act=t.dataset.fa;
  if(act==='zoom'){
    const root=document.getElementById('lightboxRoot');if(!root||!FILES.safeUrl(t.getAttribute('src')))return;
    root.innerHTML=`<div class="lightbox" id="lb"><img src="${esc(t.getAttribute('src'))}"><button class="lb-btn lb-close" id="lbX">✕</button></div>`;
    const close=()=>{root.innerHTML='';document.removeEventListener('keydown',k)};
    const k=ev=>{if(ev.key==='Escape')close()};
    document.addEventListener('keydown',k);
    document.getElementById('lbX').onclick=close;
    document.getElementById('lb').onclick=ev=>{if(ev.target.id==='lb')close()};
  }else if(act==='expand'){
    const card=t.closest('.fa-card'),pre=card&&card.querySelector('.fa-snippet');if(!pre)return;
    if(pre.dataset.open==='1'){pre.dataset.open='0';pre.classList.remove('open');pre.textContent=pre._short;t.textContent='Show more';return}
    const url=pre.dataset.faFull;if(!FILES.safeUrl(url))return;
    if(pre._full==null){
      t.disabled=true;t.textContent='Loading…';
      try{
        const r=await fetch(url);if(!r.ok)throw new Error('http '+r.status);
        const txt=await r.text();pre._full=txt.length>30000?txt.slice(0,30000)+'\n… (truncated — download for the rest)':txt;
      }catch(_){
        t.disabled=false;t.textContent='Show more';
        toast('Can\'t load the whole file here — use Download. (Apply cors.json to the bucket to enable this.)','bad');return;
      }
      t.disabled=false;
    }
    pre._short=pre.textContent;pre.textContent=pre._full;pre.dataset.open='1';pre.classList.add('open');t.textContent='Show less';
  }
});

/* ---------- drag & drop onto the open chat ---------- */
(function(){
  const hasFiles=e=>e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files');
  const zone=()=>document.getElementById('chatPage');
  let depth=0;
  const setOn=on=>{const z=zone();if(z)z.classList.toggle('fa-dragover',on)};
  document.addEventListener('dragenter',e=>{if(!hasFiles(e)||typeof view==='undefined'||view.page!=='chatPage'||!view.roomKey)return;depth++;setOn(true)});
  document.addEventListener('dragleave',e=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)setOn(false)});
  document.addEventListener('dragover',e=>{if(hasFiles(e)&&typeof view!=='undefined'&&view.page==='chatPage'&&view.roomKey)e.preventDefault()});
  document.addEventListener('drop',e=>{
    depth=0;setOn(false);
    if(!hasFiles(e)||typeof view==='undefined'||view.page!=='chatPage'||!view.roomKey)return;
    e.preventDefault();
    if(typeof addPickedFiles==='function')addPickedFiles([...e.dataTransfer.files]);
  });
})();
