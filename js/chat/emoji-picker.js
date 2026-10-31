/* ==========================================================================
 * js/chat/emoji-picker.js
 * Emoji picker popover for the composer
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

let _emojiPopClose=null,_emojiPopAnchor=null;
function openEmojiPicker(anchorEl,onPick){
  const wasOpenHere=_emojiPopAnchor===anchorEl;
  if(_emojiPopClose)_emojiPopClose();
  if(wasOpenHere)return;   // clicking the same anchor again just closes it
  const root=document.createElement('div');
  document.body.appendChild(root);
  const pop=document.createElement('div');pop.className='emoji-pop';
  pop.innerHTML=`<div class="emoji-pop-quick" id="emojiQuick"></div>
    <div class="emoji-pop-search"><input type="text" placeholder="Search emoji…" id="emojiSearchIn"></div>
    <div class="emoji-pop-grid" id="emojiGrid"></div>`;
  root.appendChild(pop);
  // Discord-style quick-pick row of common emoji above the full picker
  const quick=pop.querySelector('#emojiQuick');
  QUICK_REACT.forEach(e=>{
    const b=document.createElement('button');b.textContent=e;b.title=e;
    b.onclick=()=>{onPick(e);close()};
    quick.appendChild(b);
  });
  // Position: default to opening below the anchor, but flip to opening upward
  // when there isn't enough room below in the viewport (fixes the picker
  // growing off the bottom of the screen instead of appearing usable).
  const POP_H=300,POP_W=296; // approx rendered height/width incl. margins
  const rect=anchorEl.getBoundingClientRect();
  const left=Math.max(8,Math.min(rect.left+window.scrollX,window.innerWidth-POP_W));
  const roomBelow=window.innerHeight-rect.bottom;
  const roomAbove=rect.top;
  const openUp=roomBelow<POP_H && roomAbove>roomBelow;
  pop.style.position='absolute';
  pop.style.left=left+'px';
  if(openUp){
    const bottom=window.innerHeight-rect.top+window.scrollY+6;
    pop.style.bottom=bottom+'px';
    pop.style.maxHeight=Math.max(160,roomAbove-16)+'px';
  }else{
    const top=rect.bottom+window.scrollY+6;
    pop.style.top=top+'px';
    pop.style.maxHeight=Math.max(160,roomBelow-16)+'px';
  }
  const grid=pop.querySelector('#emojiGrid');
  function draw(q){
    grid.innerHTML='';
    const query=q.trim().toLowerCase().replace(/^:|:$/g,''); // allow searching with or without colons
    if(!query){
      EMOJI_CATS.forEach(cat=>{
        cat.list.forEach(([e,name])=>{
          const b=document.createElement('button');b.textContent=e;b.title=':'+name+':';
          b.onclick=()=>{onPick(e);close()};
          grid.appendChild(b);
        });
      });
      return;
    }
    // Discord-style :name: search: exact name match first, then names containing the query,
    // so typing "sob" (or ":sob:") surfaces 😭 even without knowing the exact glyph.
    const all=EMOJI_CATS.flatMap(c=>c.list);
    const exact=all.filter(([,name])=>name===query);
    const partial=all.filter(([,name])=>name!==query&&name.includes(query));
    const hits=[...exact,...partial];
    if(!hits.length){grid.innerHTML='<div class="emoji-pop-empty">No matches — try browsing instead.</div>';return}
    hits.forEach(([e,name])=>{const b=document.createElement('button');b.textContent=e;b.title=':'+name+':';b.onclick=()=>{onPick(e);close()};grid.appendChild(b)});
  }
  draw('');
  const search=pop.querySelector('#emojiSearchIn');
  search.addEventListener('input',()=>draw(search.value));
  search.focus();
  function outside(e){if(!pop.contains(e.target)&&e.target!==anchorEl)close()}
  function esc_(e){if(e.key==='Escape')close()}
  setTimeout(()=>{document.addEventListener('mousedown',outside);document.addEventListener('keydown',esc_)},0);
  function close(){
    root.remove();
    document.removeEventListener('mousedown',outside);
    document.removeEventListener('keydown',esc_);
    if(_emojiPopClose===close){_emojiPopClose=null;_emojiPopAnchor=null}
  }
  _emojiPopClose=close;_emojiPopAnchor=anchorEl;
}
