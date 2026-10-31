/* ==========================================================================
 * js/features/trick-or-treat-games.js
 * Halloween 2026 — the nine minigames inside Trick or Treat.
 *
 * Each game gets a host element and a done(score) callback; js/features/trick-or-treat.js owns the
 * scoring, the cooldown and the saving. Everything is plain DOM (no canvas), so it works the same
 * on a school Chromebook as on a phone.
 * Loaded by js/loader.js (load order lives in js/manifest.js) — before trick-or-treat.js.
 * ========================================================================== */
'use strict';

/* shared helpers -------------------------------------------------------- */
function totgClear(t){t.forEach(x=>{try{clearInterval(x);clearTimeout(x);cancelAnimationFrame(x)}catch(_){}})}
function totgCountdown(host,secs,onEnd){
  const bar=host.querySelector('.totg-time i'),tx=host.querySelector('.totg-time span');
  const t0=performance.now(),dur=secs*1000;
  let raf=0;
  (function step(){
    const left=Math.max(0,dur-(performance.now()-t0));
    if(bar)bar.style.width=(left/dur*100)+'%';
    if(tx)tx.textContent=(left/1000).toFixed(1)+'s';
    if(left<=0){onEnd();return}
    raf=requestAnimationFrame(step);
  })();
  return()=>cancelAnimationFrame(raf);
}
const totgShell=(title,sub,body)=>`
  <div class="totg">
    <div class="totg-head"><div><b>${title}</b><small>${sub}</small></div>
      <div class="totg-score">Score <b id="totgScore">0</b></div></div>
    <div class="totg-time"><i></i><span></span></div>
    ${body}
  </div>`;
const totgSetScore=n=>{const e=document.getElementById('totgScore');if(e)e.textContent=n};

/* ---------------------------------------------------------------- 1. SMASH
   Whack-a-mole. Pumpkins are worth a point, ghosts take one away. 16 seconds. */
function totgSmash(host,done){
  const HOLES=9;
  host.innerHTML=totgShell('🔨 Pumpkin Smash','Hit the pumpkins. Leave the ghosts alone.',
    `<div class="totg-grid">${Array.from({length:HOLES},(_,i)=>`<button type="button" class="totg-hole" data-h="${i}"><span class="totg-pop"></span></button>`).join('')}</div>`);
  let score=0,alive=true;const timers=[];
  const holes=[...host.querySelectorAll('.totg-hole')];
  function spawn(){
    if(!alive)return;
    const free=holes.filter(h=>!h.classList.contains('up'));
    if(free.length){
      const h=free[Math.floor(Math.random()*free.length)];
      const ghost=Math.random()<0.3;
      const pop=h.querySelector('.totg-pop');
      pop.textContent=ghost?'👻':'🎃';
      h.classList.add('up');h.classList.toggle('ghost',ghost);
      h.dataset.ghost=ghost?'1':'';
      const up=setTimeout(()=>{h.classList.remove('up','hit');},ghost?950:820);
      timers.push(up);
    }
    timers.push(setTimeout(spawn,Math.max(320,700-score*12)));
  }
  holes.forEach(h=>h.onclick=()=>{
    if(!alive||!h.classList.contains('up')||h.classList.contains('hit'))return;
    h.classList.add('hit');
    if(h.dataset.ghost){score=Math.max(0,score-1);h.classList.add('bad')}
    else score++;
    totgSetScore(score);
    setTimeout(()=>{h.classList.remove('up','hit','bad')},140);
  });
  timers.push(setTimeout(spawn,500));
  const stop=totgCountdown(host,16,()=>{alive=false;totgClear(timers);stop();done(score)});
  return()=>{alive=false;totgClear(timers);stop()};
}

/* ---------------------------------------------------------------- 2. CATCH
   Move the bucket, catch the sweets, dodge the bombs. 20 seconds. */
function totgCatch(host,done){
  host.innerHTML=totgShell('🧺 Candy Catch','Move to catch. Bombs cost you two.',
    `<div class="totg-field" id="totgField"><div class="totg-bucket" id="totgBucket">🧺</div></div>
     <div class="totg-hint">Move your mouse or drag across the field</div>`);
  const field=host.querySelector('#totgField'),bucket=host.querySelector('#totgBucket');
  let score=0,alive=true,bx=0.5;const items=[];const timers=[];
  const GOOD=['🍬','🍫','🍭','🍪'];
  function place(e){
    const r=field.getBoundingClientRect();
    const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left;
    bx=Math.max(0,Math.min(1,x/r.width));
    bucket.style.left=(bx*100)+'%';
  }
  field.addEventListener('mousemove',place);
  field.addEventListener('touchmove',e=>{place(e);e.preventDefault()},{passive:false});
  function spawn(){
    if(!alive)return;
    const bomb=Math.random()<0.22;
    const el=document.createElement('div');
    el.className='totg-fall'+(bomb?' bomb':'');
    el.textContent=bomb?'💣':GOOD[Math.floor(Math.random()*GOOD.length)];
    el.dataset.x=Math.random().toFixed(3);
    el.style.left=(el.dataset.x*100)+'%';
    el.dataset.y='0';
    field.appendChild(el);
    items.push(el);
    timers.push(setTimeout(spawn,Math.max(230,460-score*6)));
  }
  let raf=0,last=performance.now();
  (function loop(t){
    if(!alive)return;
    const dt=Math.min(50,t-last);last=t;
    const h=field.clientHeight||220;
    for(let i=items.length-1;i>=0;i--){
      const el=items[i];
      let y=Number(el.dataset.y)+dt*0.00042;          // fraction of the field per ms
      el.dataset.y=y;el.style.top=(y*100)+'%';
      if(y>=0.80&&y<=0.97&&!el.dataset.done){
        if(Math.abs(Number(el.dataset.x)-bx)<0.11){
          el.dataset.done='1';
          if(el.classList.contains('bomb')){score=Math.max(0,score-2);bucket.classList.add('oof')}
          else{score++;bucket.classList.add('got')}
          totgSetScore(score);
          el.classList.add('caught');
          setTimeout(()=>bucket.classList.remove('got','oof'),180);
          setTimeout(()=>el.remove(),180);
          items.splice(i,1);continue;
        }
      }
      if(y>1.05){el.remove();items.splice(i,1)}
    }
    raf=requestAnimationFrame(loop);
  })(last);
  timers.push(setTimeout(spawn,400));
  const stop=totgCountdown(host,20,()=>{alive=false;cancelAnimationFrame(raf);totgClear(timers);stop();done(score)});
  return()=>{alive=false;cancelAnimationFrame(raf);totgClear(timers);stop()};
}

/* --------------------------------------------------------------- 3. MEMORY
   Six pairs. The faster you clear it, the bigger the payout. */
function totgMemory(host,done){
  const FACES=['🎃','👻','🦇','🕷️','🍬','💀'];
  const deck=FACES.concat(FACES).map(f=>({f,k:Math.random()})).sort((a,b)=>a.k-b.k);
  host.innerHTML=totgShell('🃏 Haunted Memory','Match all six pairs. Faster is worth more.',
    `<div class="totg-cards">${deck.map((c,i)=>`<button type="button" class="totg-card" data-c="${i}" data-f="${c.f}"><span class="totg-back">🎃</span><span class="totg-face">${c.f}</span></button>`).join('')}</div>`);
  let open=[],found=0,lock=false,alive=true,moves=0;
  const t0=performance.now();
  const cards=[...host.querySelectorAll('.totg-card')];
  const tx=host.querySelector('.totg-time span'),bar=host.querySelector('.totg-time i');
  let raf=0;
  (function tick(){
    if(!alive)return;
    const s=(performance.now()-t0)/1000;
    if(tx)tx.textContent=s.toFixed(1)+'s';
    if(bar)bar.style.width=Math.max(0,100-s/60*100)+'%';
    raf=requestAnimationFrame(tick);
  })();
  cards.forEach(c=>c.onclick=()=>{
    if(lock||!alive||c.classList.contains('on')||c.classList.contains('done'))return;
    c.classList.add('on');open.push(c);
    if(open.length===2){
      moves++;totgSetScore(moves+' moves');
      lock=true;
      const [a,b]=open;
      if(a.dataset.f===b.dataset.f){
        setTimeout(()=>{a.classList.add('done');b.classList.add('done');open=[];lock=false;
          if(++found===FACES.length){
            alive=false;cancelAnimationFrame(raf);
            done(Math.max(1,Math.round((performance.now()-t0)/1000)),'time');
          }},320);
      }else{
        setTimeout(()=>{a.classList.remove('on');b.classList.remove('on');open=[];lock=false},700);
      }
    }
  });
  // hard stop so nobody sits in it forever
  const bail=setTimeout(()=>{if(alive){alive=false;cancelAnimationFrame(raf);done(999,'time')}},90000);
  return()=>{alive=false;cancelAnimationFrame(raf);clearTimeout(bail)};
}


/* ---------------------------------------------------------------- 4. TYPER
   Type the word before it falls off the list. Pure speed, no luck at all. */
const TOTG_WORDS=['pumpkin','ghost','candy','spooky','haunted','witch','skeleton','cobweb','lantern',
  'midnight','costume','monster','vampire','graveyard','shiver','creepy','goblin','cauldron','broomstick',
  'moonlight','bats','zombie','trick','treat','spider','werewolf','mummy','potion','gravestone','howl'];
function totgTyper(host,done){
  host.innerHTML=totgShell('⌨️ Spooky Typer','Type each word and press Enter. 22 seconds.',
    `<div class="totg-word" id="totgWord"></div>
     <input class="totg-input" id="totgInput" type="text" autocomplete="off" autocorrect="off"
            autocapitalize="off" spellcheck="false" placeholder="type it here…">
     <div class="totg-hint">Spelling counts. Enter submits.</div>`);
  let score=0,alive=true,word='';
  const wEl=host.querySelector('#totgWord'),inp=host.querySelector('#totgInput');
  const next=()=>{word=TOTG_WORDS[Math.floor(Math.random()*TOTG_WORDS.length)];wEl.textContent=word};
  next();
  setTimeout(()=>{try{inp.focus()}catch(_){}} ,60);
  inp.addEventListener('keydown',e=>{
    e.stopPropagation();                       // the site has global key shortcuts
    if(e.key!=='Enter'||!alive)return;
    e.preventDefault();
    if(inp.value.trim().toLowerCase()===word){
      score++;totgSetScore(score);
      wEl.classList.remove('hit');void wEl.offsetWidth;wEl.classList.add('hit');
      next();
    }else{
      wEl.classList.remove('miss');void wEl.offsetWidth;wEl.classList.add('miss');
    }
    inp.value='';
  });
  const stop=totgCountdown(host,22,()=>{alive=false;stop();try{inp.blur()}catch(_){}done(score)});
  return()=>{alive=false;stop()};
}

/* --------------------------------------------------------------- 5. STEADY
   A marker sweeps the bar; stop it inside the green. The green gets smaller every round.
   Five rounds, no randomness in the payout — it is entirely how steady you are. */
function totgSteady(host,done){
  host.innerHTML=totgShell('🕯️ Steady Hand','Stop the flame inside the green. 5 rounds, each one narrower.',
    `<div class="totg-steady">
       <div class="totg-track"><span class="totg-zone" id="totgZone"></span><span class="totg-marker" id="totgMark">🕯️</span></div>
       <div class="totg-rounds" id="totgRounds"></div>
     </div>
     <button type="button" class="btn totg-stop" id="totgStop">Stop it</button>`);
  const ROUNDS=5;
  let round=0,score=0,alive=true,raf=0,pos=0,dir=1,zoneA=0,zoneB=0,speed=0.016,settling=false;
  const zone=host.querySelector('#totgZone'),mark=host.querySelector('#totgMark'),
        rEl=host.querySelector('#totgRounds'),btn=host.querySelector('#totgStop');
  const paintRounds=()=>{rEl.innerHTML=Array.from({length:ROUNDS},(_,i)=>
    `<i class="${i<round?(rEl.dataset['r'+i]==='1'?'hit':'miss'):''}"></i>`).join('')};
  function setup(){
    const w=Math.max(8,26-round*4);                 // 26% down to 10% of the bar
    zoneA=5+Math.random()*(90-w);zoneB=zoneA+w;
    zone.style.left=zoneA+'%';zone.style.width=w+'%';
    speed=0.5+round*0.14;                            // percent per frame
    pos=0;dir=1;
    paintRounds();
  }
  function loop(){
    if(!alive)return;
    pos+=dir*speed;
    if(pos>=100){pos=100;dir=-1}
    if(pos<=0){pos=0;dir=1}
    mark.style.left=pos+'%';
    raf=requestAnimationFrame(loop);
  }
  /* `settling` is what stops a second click landing during the half-second pause between rounds:
     the marker has not moved yet, so without it you could mash the button inside the zone and
     score the same round over and over (it read "8 of 5" before this guard existed). */
  function stopIt(){
    if(!alive||settling)return;
    settling=true;btn.disabled=true;
    const ok=pos>=zoneA&&pos<=zoneB;
    rEl.dataset['r'+round]=ok?'1':'0';
    if(ok){score++;totgSetScore(score);zone.classList.add('ok')}
    else zone.classList.add('no');
    round++;
    cancelAnimationFrame(raf);
    setTimeout(()=>{
      zone.classList.remove('ok','no');
      if(round>=ROUNDS||!alive){alive=false;paintRounds();done(Math.min(ROUNDS,score));return}
      settling=false;btn.disabled=false;
      setup();loop();
    },520);
  }
  btn.onclick=stopIt;
  setup();loop();
  const stop=totgCountdown(host,45,()=>{if(alive){alive=false;cancelAnimationFrame(raf);stop();done(score)}});
  return()=>{alive=false;cancelAnimationFrame(raf);stop()};
}

/* ----------------------------------------------------------------- 6. DASH
   An endless runner. One button, so it works the same with a mouse, a finger or the
   space bar. One hit ends the run, which is what makes a long one worth something. */
function totgDash(host,done){
  host.innerHTML=totgShell('🏃 Street Dash','Jump the fences. One hit ends the run.',
    `<div class="totg-dash" id="totgDash"><span class="totg-runner" id="totgRun">🏃</span></div>
     <div class="totg-hint">Tap the strip, click it, or press Space to jump.</div>`);
  const box=host.querySelector('#totgDash'),run=host.querySelector('#totgRun');
  const PIECES=['🪵','🪦','🎃','🕸️','🧱'];
  const G=0.0022,JUMP=0.45,RUN_L=34,RUN_R=60,CLEAR=26,OW=20;
  /* Obstacles enter from no further than START px away, so the first fence arrives about a second
     in rather than after a long empty run on a wide screen. */
  const START=300;
  let alive=true,score=0,raf=0,y=0,vy=0,last=0,nextIn=500,speed=0.40,obs=[];
  const jump=()=>{if(alive&&y<=0.5)vy=JUMP};
  const onKey=e=>{if(e.code==='Space'||e.key===' '){e.preventDefault();e.stopPropagation();jump()}};
  const onTap=e=>{e.preventDefault();jump()};
  box.addEventListener('pointerdown',onTap);
  document.addEventListener('keydown',onKey,true);
  function finish(){
    if(!alive)return;
    alive=false;cancelAnimationFrame(raf);
    document.removeEventListener('keydown',onKey,true);
    box.removeEventListener('pointerdown',onTap);
    box.classList.add('crash');
    stop();
    setTimeout(()=>done(score),420);
  }
  function frame(now){
    if(!alive)return;
    const dt=last?Math.min(40,now-last):16;last=now;
    y+=vy*dt;vy-=G*dt;
    if(y<0){y=0;vy=0}
    run.style.transform='translateY('+(-y)+'px)';
    run.classList.toggle('air',y>2);
    nextIn-=dt;
    if(nextIn<=0){
      const el=document.createElement('span');
      el.className='totg-obs';el.textContent=PIECES[Math.floor(Math.random()*PIECES.length)];
      box.appendChild(el);
      const x0=Math.min(box.clientWidth+10,START);
      el.style.left=x0+'px';
      obs.push({el,x:x0});
      nextIn=620+Math.random()*460-speed*400;    // gets tighter as it speeds up
      speed=Math.min(0.58,speed+0.014);
    }
    for(let i=obs.length-1;i>=0;i--){
      const o=obs[i];
      o.x-=speed*dt;
      o.el.style.left=o.x+'px';
      if(o.x<RUN_R&&o.x+OW>RUN_L&&y<CLEAR){finish();return}
      if(o.x<-OW-4){o.el.remove();obs.splice(i,1);score++;totgSetScore(score)}
    }
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);
  const stop=totgCountdown(host,30,()=>{if(alive)finish()});
  return()=>{alive=false;cancelAnimationFrame(raf);stop();
    document.removeEventListener('keydown',onKey,true);box.removeEventListener('pointerdown',onTap)};
}

/* --------------------------------------------------------------- 7. POTION
   Watch the cauldron, repeat the order. One more ingredient every round, so the
   score is simply how long a sequence you can hold in your head. */
function totgPotion(host,done){
  const ING=[{ic:'🍬',c:'a'},{ic:'🦇',c:'b'},{ic:'🕷️',c:'c'},{ic:'👁️',c:'d'}];
  host.innerHTML=totgShell('🧪 Potion Brew','Watch the order, then repeat it.',
    `<div class="totg-potion" id="totgPot">
       ${ING.map((x,i)=>`<button type="button" class="totg-ing" data-ing="${i}">${x.ic}</button>`).join('')}
     </div>
     <div class="totg-step" id="totgStep">Watch…</div>`);
  const btns=[...host.querySelectorAll('[data-ing]')],step=host.querySelector('#totgStep');
  let seq=[],input=0,score=0,alive=true,showing=true,timers=[];
  const flash=(i,ms)=>{const b=btns[i];if(!b)return;b.classList.add('lit');
    timers.push(setTimeout(()=>b.classList.remove('lit'),ms))};
  function show(){
    showing=true;input=0;step.textContent='Watch… ('+seq.length+')';
    btns.forEach(b=>b.disabled=true);
    const gap=Math.max(320,620-seq.length*22);
    seq.forEach((v,n)=>timers.push(setTimeout(()=>{if(alive)flash(v,gap*0.55)},n*gap)));
    timers.push(setTimeout(()=>{
      if(!alive)return;
      showing=false;step.textContent='Your turn';
      btns.forEach(b=>b.disabled=false);
    },seq.length*gap+180));
  }
  function nextRound(){
    seq.push(Math.floor(Math.random()*ING.length));
    show();
  }
  btns.forEach((b,i)=>b.onclick=()=>{
    if(!alive||showing)return;
    flash(i,180);
    if(seq[input]===i){
      input++;
      if(input>=seq.length){
        // lock input straight away: a stray extra tap in the gap before the next round should
        // not be read as a wrong ingredient and end the run
        showing=true;btns.forEach(x=>x.disabled=true);
        score++;totgSetScore(score);
        step.textContent='✅ Round '+score+' brewed';
        if(score>=12){finish();return}
        timers.push(setTimeout(()=>{if(alive)nextRound()},620));
      }
    }else{
      step.textContent='❌ Wrong ingredient';
      host.querySelector('.totg-potion').classList.add('bad');
      finish();
    }
  });
  function finish(){if(!alive)return;alive=false;totgClear(timers);stop();
    btns.forEach(b=>b.disabled=true);setTimeout(()=>done(score),520)}
  const stop=totgCountdown(host,60,()=>{if(alive)finish()});
  timers.push(setTimeout(()=>{if(alive)nextRound()},500));
  return()=>{alive=false;totgClear(timers);stop()};
}

/* ---------------------------------------------------------------- 8. GHOST
   Pure reaction time. Five rounds; the faster you are after BOO, the more it pays.
   Jumping the gun scores that round zero, so there is no way to cheat it by mashing. */
function totgGhost(host,done){
  host.innerHTML=totgShell('👻 Ghost Rush','Tap the moment it says BOO. Not before.',
    `<button type="button" class="totg-boo waiting" id="totgBoo"><b>Get ready…</b><small>Round 1 of 5</small></button>
     <div class="totg-hint" id="totgBooH">Wait for it.</div>`);
  const ROUNDS=5;
  const pad=host.querySelector('#totgBoo'),hint=host.querySelector('#totgBooH');
  let round=0,score=0,alive=true,state='wait',t=0,timers=[];
  function arm(){
    if(!alive)return;
    state='wait';pad.className='totg-boo waiting';
    pad.innerHTML='<b>Get ready…</b><small>Round '+(round+1)+' of '+ROUNDS+'</small>';
    timers.push(setTimeout(()=>{
      if(!alive||state!=='wait')return;
      state='go';t=performance.now();
      pad.className='totg-boo go';pad.innerHTML='<b>BOO!</b><small>tap now</small>';
    },1100+Math.random()*2600));
  }
  function result(txt,pts){
    score+=pts;totgSetScore(score);
    pad.className='totg-boo done';
    pad.innerHTML='<b>'+txt+'</b><small>+'+pts+'</small>';
    round++;
    if(round>=ROUNDS){alive=false;stop();setTimeout(()=>done(score),700);return}
    timers.push(setTimeout(arm,750));
  }
  pad.onclick=()=>{
    if(!alive)return;
    if(state==='wait'){state='early';hint.textContent='Too early — that round scored nothing.';result('Too early',0);return}
    if(state!=='go')return;
    state='done';
    const ms=Math.round(performance.now()-t);
    const pts=Math.max(5,Math.min(100,Math.round(100-(ms-180)/6)));
    hint.textContent=ms+'ms';
    result(ms+'ms',pts);
  };
  arm();
  const stop=totgCountdown(host,45,()=>{if(alive){alive=false;done(score)}});
  return()=>{alive=false;totgClear(timers);stop()};
}

/* ------------------------------------------------------------------ 9. ODD
   Spot the one that does not match. The grid grows every time you get it, so it
   goes from trivial to genuinely hard inside twenty seconds. */
const TOTG_ODD=[['🍬','🍭'],['💀','☠️'],['🌕','🌝'],['🦇','🐦'],['🕷️','🕸️'],
  ['🧛','🧟'],['😈','👿'],['🎃','🟠'],['👻','👽'],['🧙','🧝']];
function totgOdd(host,done){
  host.innerHTML=totgShell('🔦 Odd One Out','Find the one that is different.',
    `<div class="totg-odd" id="totgOdd"></div>
     <div class="totg-hint" id="totgOddH">It gets bigger every time you find it.</div>`);
  const grid=host.querySelector('#totgOdd'),hint=host.querySelector('#totgOddH');
  let score=0,alive=true,lock=false;
  function round(){
    if(!alive)return;
    const n=Math.min(7,3+Math.floor(score/2));          // 3×3 up to 7×7
    const cells=n*n,pair=TOTG_ODD[Math.floor(Math.random()*TOTG_ODD.length)];
    const flip=Math.random()<0.5,base=pair[flip?1:0],odd=pair[flip?0:1];
    const at=Math.floor(Math.random()*cells);
    grid.style.setProperty('--n',n);
    grid.innerHTML=Array.from({length:cells},(_,i)=>
      `<button type="button" class="totg-cell" data-odd="${i===at?1:0}">${i===at?odd:base}</button>`).join('');
    grid.querySelectorAll('[data-odd]').forEach(b=>b.onclick=()=>{
      if(!alive||lock)return;
      if(b.dataset.odd==='1'){
        score++;totgSetScore(score);b.classList.add('yes');
        lock=true;setTimeout(()=>{lock=false;round()},230);
      }else{
        b.classList.add('no');hint.textContent='Not that one.';
      }
    });
  }
  round();
  const stop=totgCountdown(host,22,()=>{if(alive){alive=false;stop();done(score)}});
  return()=>{alive=false;stop()};
}

/* The list the Minigames tab renders. payout() turns a raw score into candy. */
const TOT_GAMES=[
  {id:'smash', n:'Pumpkin Smash', ic:'🔨', d:'16s · hit pumpkins, dodge ghosts', run:totgSmash,
   payout:s=>Math.min(500,s*16), unit:s=>s+' smashed', ach:s=>s>=20?'smash':''},
  {id:'catch', n:'Candy Catch',   ic:'🧺', d:'20s · catch sweets, dodge bombs',  run:totgCatch,
   payout:s=>Math.min(500,s*15), unit:s=>s+' caught',  ach:s=>s>=25?'catch':''},
  {id:'memory',n:'Haunted Memory',ic:'🃏', d:'Match 6 pairs as fast as you can', run:totgMemory,
   payout:s=>Math.max(80,Math.min(500,Math.round(500-s*10))), unit:s=>s+'s', ach:s=>s<=20?'memory':''},
  {id:'typer', n:'Spooky Typer',  ic:'⌨️', d:'22s · type the words, spelling counts', run:totgTyper,
   payout:s=>Math.min(500,s*26), unit:s=>s+' typed',   ach:s=>s>=12?'typer':''},
  {id:'steady',n:'Steady Hand',   ic:'🕯️', d:'5 rounds · stop the flame in the green', run:totgSteady,
   payout:s=>s*95, unit:s=>s+' of 5', ach:s=>s>=5?'steady':''},
  {id:'dash',  n:'Street Dash',   ic:'🏃', d:'Endless runner · jump the fences', run:totgDash,
   payout:s=>Math.min(500,s*22), unit:s=>s+' cleared', ach:s=>s>=15?'dash':''},
  {id:'potion',n:'Potion Brew',   ic:'🧪', d:'Simon says · repeat the order', run:totgPotion,
   payout:s=>Math.min(500,s*55), unit:s=>'round '+s, ach:s=>s>=8?'potion':''},
  {id:'ghost', n:'Ghost Rush',    ic:'👻', d:'5 rounds · reaction time', run:totgGhost,
   payout:s=>Math.min(500,s), unit:s=>s+' pts', ach:s=>s>=380?'ghost':''},
  {id:'odd',   n:'Odd One Out',   ic:'🔦', d:'22s · spot the one that differs', run:totgOdd,
   payout:s=>Math.min(500,s*34), unit:s=>s+' found', ach:s=>s>=12?'odd':''}
];
