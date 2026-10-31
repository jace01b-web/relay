/* ==========================================================================
 * js/features/trick-or-treat.js
 * HALLOWEEN 2026 — TRICK OR TREAT
 *
 * A one-night event. Knock on doors, collect candy, play the minigames, spend it in the shop and
 * climb the leaderboard. There is no betting in it: every way of earning is either skill or a
 * flat reward, and nothing ever takes candy back off you. Collecting closes at midnight Texas
 * time on Halloween; the board stays up for a few days afterwards so the top 5 can be paid out.
 *
 * Everything lives under tot/p/<id> in the database and is written by the player's own client
 * (the rules allow only that, and rate-limit it — see SETUP-TRICKORTREAT.md). Nothing here
 * touches the existing Halloween Pass in js/features/halloween.js; that uses HW_/hw*, this uses
 * TOT_/tot*.
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * ========================================================================== */
'use strict';

const TOT={
  /* Texas time. Oct 31 2026 is CDT (UTC-5); Nov 5 is CST (UTC-6) — DST ends Nov 1. */
  END:Date.UTC(2026,10,1,5,0,0),          // midnight at the end of Halloween, Central
  BOARD_END:Date.UTC(2026,10,6,6,0,0),    // board stays visible through the end of Nov 5, Central
  KNOCK_MS:6000,                          // cooldown between knocks (the rules enforce ~5.5s)
  MAX:1000000,                            // hard ceiling the rules also apply
  WINNERS:5,
  GAME_MS:45000,                          // cooldown between minigames (rules enforce ~40s)
  BONUS_MS:3600000                        // the free doorbell bonus, once an hour (rules ~58m)
};
/* Things you can buy with candy. The permanent one is the money sink that gives the night a shape:
   grind early, buy the bucket, every door pays more for the rest of the event. */
const TOT_SHOP=[
  {id:'rush', ic:'⚡',n:'Sugar Rush', cost:300,d:'Knock and minigame cooldowns halved for 3 minutes.'},
  {id:'luck', ic:'🍀',n:'Lucky Charm',cost:450,d:'Your next 10 knocks cannot be a trick, and pay 25% more.'},
  {id:'bag',  ic:'🎒',n:'Bigger Bucket',cost:900,d:'Every door pays 15% more. Lasts the whole event.',once:true}
];
/* Costumes are pure decoration — they change nothing about how the night plays, they just show up
   next to your name on the leaderboard. That makes them a candy sink with no balance consequences,
   which is exactly what you want somebody spending 6,000 on. */
const TOT_FITS=[
  {id:'gh',ic:'👻',n:'Bedsheet Ghost',cost:200},
  {id:'vm',ic:'🧛',n:'Vampire',       cost:600},
  {id:'wi',ic:'🧙',n:'Witch',         cost:1200},
  {id:'sk',ic:'💀',n:'Skeleton',      cost:2000},
  {id:'pk',ic:'🎃',n:'Pumpkin King',  cost:3500},
  {id:'cr',ic:'👑',n:'Candy Monarch', cost:6000}
];
/* Challenges. Every one is a milestone on a number already being tracked, so there is nothing
   extra to store except which ones have been cashed in. They give the night a to-do list. */
const TOT_QUESTS=[
  {id:'d25',  ic:'🚪',n:'Door to door',    d:'Knock on 25 doors',          pay:200, at:m=>Math.min(1,m.doors/25)},
  {id:'g3',   ic:'🕹️',n:'Arcade warm-up',  d:'Play 3 minigames',           pay:250, at:m=>Math.min(1,m.games/3)},
  {id:'h120', ic:'🍫',n:'Big haul',        d:'Get 120+ from one door',     pay:350, at:m=>Math.min(1,m.best/120)},
  {id:'d75',  ic:'🏘️',n:'Street sweeper',  d:'Knock on 75 doors',          pay:450, at:m=>Math.min(1,m.doors/75)},
  {id:'e2500',ic:'💰',n:'Collector',       d:'Earn 2,500 candy in total',  pay:500, at:m=>Math.min(1,m.earned/2500)},
  {id:'g12',  ic:'🎮',n:'Arcade regular',  d:'Play 12 minigames',          pay:600, at:m=>Math.min(1,m.games/12)},
  {id:'g9',   ic:'🏅',n:'Try everything',  d:'Play all nine minigames',    pay:900, at:m=>Math.min(1,totPlayedN()/totGamesN())},
  {id:'e10k', ic:'🏦',n:'Candy hoard',     d:'Earn 10,000 candy in total', pay:1200,at:m=>Math.min(1,m.earned/10000)}
];
/* Collectables. Cheap to earn, nice to complete, and they show on your leaderboard row. */
const TOT_ACH=[
  {id:'first', ic:'🚪',n:'First door',      d:'Knock once'},
  {id:'bar',   ic:'🍫',n:'Full size',       d:'Get a full-size bar'},
  {id:'jack',  ic:'🎃',n:'The good house',  d:'Find the jackpot house'},
  {id:'haunt', ic:'🏚️',n:'Brave',           d:'Go inside the haunted house'},
  {id:'rain',  ic:'🌧️',n:'Soaked',          d:'Knock during Candy Rain'},
  {id:'s10',   ic:'🔥',n:'On a roll',       d:'Reach a 10 streak'},
  {id:'rich',  ic:'💰',n:'Loaded',          d:'Hold 1,000 candy'},
  {id:'rich5', ic:'🏦',n:'Candy baron',     d:'Hold 5,000 candy'},
  {id:'fit',   ic:'🪡',n:'Dressed up',      d:'Wear a costume'},
  {id:'typer', ic:'⌨️',n:'Fast fingers',    d:'12+ words in Spooky Typer'},
  {id:'steady',ic:'🕯️',n:'Steady hand',     d:'All 5 rounds in Steady Hand'},
  {id:'smash', ic:'🔨',n:'Smasher',         d:'20+ in Pumpkin Smash'},
  {id:'catch', ic:'🧺',n:'Safe hands',      d:'25+ in Candy Catch'},
  {id:'memory',ic:'🃏',n:'Sharp',           d:'Clear Memory in 20s'},
  {id:'dash',  ic:'🏃',n:'Long legs',       d:'Clear 15 fences in Street Dash'},
  {id:'potion',ic:'🧪',n:'Alchemist',       d:'Reach round 8 in Potion Brew'},
  {id:'ghost', ic:'👻',n:'Quick draw',      d:'380+ points in Ghost Rush'},
  {id:'odd',   ic:'🔦',n:'Eagle eye',       d:'12+ finds in Odd One Out'},
  {id:'d100',  ic:'🏘️',n:'Whole street',    d:'Knock on 100 doors'},
  {id:'allg',  ic:'🎯',n:'Nine for nine',   d:'Play all nine minigames'},
  {id:'quests',ic:'📜',n:'Challenger',      d:'Finish every challenge'}
];
const totNow=()=>Date.now()+(typeof SKEW==='number'?SKEW:0);
const totLive=()=>totNow()<TOT.END;                    // can you still collect?
const totVisible=()=>totNow()<TOT.BOARD_END;           // is the event still shown at all?

/* ---------- Candy Rain ----------
   A site-wide double-candy window. It is worked out purely from the clock, so every player hits
   the same five minutes without anything being stored, broadcast or capable of going out of sync:
   five minutes of double candy at the top and the bottom of every hour (server clock, via SKEW). */
const TOT_RAIN={EVERY:1800000,LEN:300000};
const _totRainT=()=>totNow()%TOT_RAIN.EVERY;
const totRainOn=()=>totLive()&&_totRainT()<TOT_RAIN.LEN;
const totRainLeft=()=>totRainOn()?TOT_RAIN.LEN-_totRainT():0;
const totRainIn=()=>totRainOn()?0:TOT_RAIN.EVERY-_totRainT();
const totRainX=()=>totRainOn()?2:1;
const totMs=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return s>=60?(Math.floor(s/60)+'m '+(s%60)+'s'):(s+'s')};

let TOT_ME={played:'',candy:0,earned:0,best:0,doors:0,streak:0,last:0,golden:0,lastg:0,bonus:0,rush:0,luck:0,bag:0,games:0,ach:'',qc:'',fit:'',fits:''};
let TOT_ALL={};
let _totUnsub=null,_totBusy=false,_totTab='street',_totTimer=null,_totHaunt=false;

/* ---------- live data ---------- */
function totWatch(){
  if(_totUnsub||typeof ME==='undefined'||!ME)return;
  try{
    _totUnsub=onValue(R('tot/p'),s=>{
      TOT_ALL=s.val()||{};
      const mine=TOT_ALL[ME.id];
      if(mine&&typeof mine==='object'){
        TOT_ME={...TOT_ME,...mine};
        ['candy','earned','best','doors','streak','last','lastg','bonus','rush','luck','bag','games']
          .forEach(k=>{TOT_ME[k]=Number(TOT_ME[k])||0});
        ['ach','played','qc','fit','fits'].forEach(k=>{
          TOT_ME[k]=typeof TOT_ME[k]==='string'?TOT_ME[k]:'';
        });
      }
      totPaint();
    },e=>console.warn('[tot] read denied',e&&e.code));
  }catch(e){console.warn('[tot] watch failed',e)}
}
function totSave(patch){
  if(!ME)return Promise.reject(new Error('Not signed in.'));
  return update(R('tot/p/'+ME.id),patch);
}
// Everyone with candy, biggest stash first. Ties break on who got there with fewer doors.
function totBoard(){
  return Object.keys(TOT_ALL).map(id=>{
    const r=TOT_ALL[id]||{};
    return{id:Number(id),candy:Number(r.candy)||0,earned:Number(r.earned)||0,doors:Number(r.doors)||0,
           best:Number(r.best)||0,fit:typeof r.fit==='string'?r.fit:''};
  }).filter(r=>!isNaN(r.id)&&r.candy>0)
    .sort((a,b)=>b.candy-a.candy||a.doors-b.doors||a.id-b.id);
}
function totRankOf(id){const b=totBoard();for(let i=0;i<b.length;i++)if(b[i].id===id)return i+1;return 0}
// Live profile first; the name stored on the row is the fallback for someone whose record
// hasn't synced to this client yet, so the board never shows a wall of "User 12".
const totName=id=>{
  const u=DB.getUser(id);
  if(u&&u.username)return displayUsername(u.username);
  const r=TOT_ALL[id];
  return (r&&typeof r.name==='string'&&r.name)?displayUsername(r.name):'User '+id;
};
const totRushOn=()=>(Number(TOT_ME.rush)||0)>totNow();
const totKnockMs=()=>totRushOn()?TOT.KNOCK_MS/2:TOT.KNOCK_MS;
const totGameMs=()=>totRushOn()?TOT.GAME_MS/2:TOT.GAME_MS;
const totCd=()=>Math.max(0,totKnockMs()-(totNow()-TOT_ME.last));
const totGameCd=()=>Math.max(0,totGameMs()-(totNow()-(Number(TOT_ME.lastg)||0)));
const totBonusCd=()=>Math.max(0,TOT.BONUS_MS-(totNow()-(Number(TOT_ME.bonus)||0)));
const totHas=id=>String(TOT_ME.ach||'').split(',').indexOf(id)!==-1;
/* Minigame helpers that TOT_QUESTS needs — TOT_GAMES lives in the other file, which loads first,
   but these are only ever called from a click or a repaint, so guard anyway. */
const totGamesN=()=>(typeof TOT_GAMES!=='undefined'?TOT_GAMES.length:9);
const totPlayedN=()=>String(TOT_ME.played||'').split(',').filter(Boolean).length;
const totOwnsFit=id=>String(TOT_ME.fits||'').split(',').indexOf(id)!==-1;
const totFitOf=id=>{const f=TOT_FITS.find(x=>x.id===id);return f?f.ic:''};
const totQDone=id=>String(TOT_ME.qc||'').split(',').indexOf(id)!==-1;
const totQReady=q=>!totQDone(q.id)&&q.at(TOT_ME)>=1;
const totQCount=()=>TOT_QUESTS.filter(totQReady).length;
// Earning one pops a toast, so they feel like a thing you got rather than a number that changed.
function totGrant(ids){
  const have=String(TOT_ME.ach||'').split(',').filter(Boolean);
  let added=[];
  [].concat(ids).filter(Boolean).forEach(id=>{
    if(have.indexOf(id)===-1&&TOT_ACH.some(a=>a.id===id)){have.push(id);added.push(id)}
  });
  if(!added.length)return null;
  added.forEach(id=>{const a=TOT_ACH.find(x=>x.id===id);if(a)toast(a.ic+' Unlocked: '+a.n)});
  return have.join(',').slice(0,200);
}
const totNum=n=>Number(n||0).toLocaleString();

/* ---------- the doors ----------
   Weighted outcomes. The good ones are frequent enough that knocking always feels worth it, and
   the bad ones only ever take a slice of what you are carrying, never all of it. */
const TOT_DOORS=[
  {k:'treat', w:30,ic:'🍬',t:'Treat!',       lo:8,  hi:18, s:['"Happy Halloween!"','A handful of sweets.','They drop a few in your bucket.']},
  {k:'big',   w:16,ic:'🍭',t:'Big handful!', lo:22, hi:44, s:['They tip the whole bowl in.','"Take as much as you want."','Jackpot of a house.']},
  {k:'bar',   w:8, ic:'🍫',t:'FULL SIZE BAR',lo:55, hi:95, s:['The legendary full-size bar.','This house gets it.','You hear other kids gasp.']},
  {k:'jack',  w:2, ic:'🎃',t:'THE GOOD HOUSE',lo:160,hi:280,s:['They were waiting all night for one more kid.','Someone just emptied the bowl into your bucket.']},
  {k:'gold',  w:5, ic:'✨',t:'Golden wrapper',lo:12, hi:25, s:['Your next 3 knocks are worth double.','It glows. That cannot be normal.']},
  /* The haunted house doesn't pay out on the spot — it opens three rooms and lets you pick one.
     Every room pays something, so going in is never worse than not going in. */
  {k:'haunt', w:4, ic:'🏚️',t:'THE HAUNTED HOUSE',lo:0,hi:0,s:['The door creaks open on its own. Three rooms. Pick one.']},
  {k:'empty', w:13,ic:'🕸️',t:'Nobody home',  lo:0,  hi:0,  s:['Lights off. Classic.','You knock. Nothing.','A note: "Took the candy, sorry!"']},
  /* A trick costs you your streak and nothing else. Nobody ever loses candy they already have —
     the whole night is additive, so there is no gambling feel to knocking on a door. */
  {k:'trick', w:16,ic:'👻',t:'TRICK!',       lo:0,  hi:0,  s:['Something jumps out and you leg it. Streak gone.','You scream. The street hears it.','The porch was a trap — no candy here.']},
  {k:'rival', w:10,ic:'🧛',t:'Beaten to it', lo:0,  hi:0,  s:['An older kid got there first. Bowl is empty.','A rival trick-or-treater cleared this one out.']}
];
const TOT_W=TOT_DOORS.reduce((t,d)=>t+d.w,0);
function totRoll(){
  const buf=new Uint32Array(1);crypto.getRandomValues(buf);
  let r=(buf[0]/4294967296)*TOT_W,acc=0;
  for(const d of TOT_DOORS){acc+=d.w;if(r<acc)return d}
  return TOT_DOORS[0];
}
const totRand=(lo,hi)=>lo+Math.floor(Math.random()*(hi-lo+1));
const totPick=a=>a[Math.floor(Math.random()*a.length)];
// Streak bonus: every door in a row without being tricked makes the next one worth more, up to +80%.
const totMult=()=>1+Math.min(TOT_ME.streak,10)*0.08;

async function totKnock(doorEl){
  if(_totBusy||!ME)return;
  if(!totLive()){toast('Trick-or-treating is over — the leaderboard is still up.','bad');return}
  // A haunted-house pick is still worth candy, so don't let the next knock paint over it.
  if(_totHaunt){toast('Pick a room in the haunted house first.','bad');return}
  if(totCd()>0)return;
  _totBusy=true;totPaint();
  const lucky=(Number(TOT_ME.luck)||0)>0;
  let d=totRoll();
  if(lucky){let guard=0;while((d.k==='trick'||d.k==='rival')&&guard++<8)d=totRoll()}   // Lucky Charm: no nasty doors
  let gain=0,lost=0,note=totPick(d.s);
  const golden=(Number(TOT_ME.golden)||0)>0;
  if(d.lo||d.hi){
    gain=Math.round(totRand(d.lo,d.hi)*totMult()*(golden?2:1)*(lucky?1.25:1)*((Number(TOT_ME.bag)||0)?1.15:1)*totRainX());
  }

  const bad=d.k==='trick'||d.k==='rival';
  const candy=Math.max(0,Math.min(TOT.MAX,TOT_ME.candy+gain-lost));
  const patch={
    candy,
    earned:Math.min(TOT.MAX*5,(Number(TOT_ME.earned)||0)+gain),
    doors:(Number(TOT_ME.doors)||0)+1,
    best:Math.max(Number(TOT_ME.best)||0,gain),
    streak:bad?0:(Number(TOT_ME.streak)||0)+1,
    golden:d.k==='gold'?3:Math.max(0,(Number(TOT_ME.golden)||0)-1),
    luck:Math.max(0,(Number(TOT_ME.luck)||0)-1),
    last:Math.round(totNow()),
    name:String(ME.username||'').slice(0,20)
  };
  const won=totGrant(['first',d.k==='bar'?'bar':'',d.k==='jack'?'jack':'',d.k==='haunt'?'haunt':'',
    totRainOn()?'rain':'',
    patch.streak>=10?'s10':'',patch.doors>=100?'d100':'',
    candy>=1000?'rich':'',candy>=5000?'rich5':'']);
  if(won)patch.ach=won;
  // show the result straight away; the write catches up
  TOT_ME={...TOT_ME,...patch};
  totShowResult(d,gain,lost,note,golden,doorEl);
  try{await totSave(patch)}
  catch(e){console.warn('[tot] save failed',e&&e.code);toast('Couldn\'t save that knock ('+(e.code||e.message)+')','bad')}
  if(d.k==='jack'&&typeof burstConfetti==='function')burstConfetti(160);
  else if(d.k==='bar'&&typeof burstConfetti==='function')burstConfetti(60);
  _totBusy=false;totPaint();
  if(d.k==='haunt')totHaunt();
}

/* ---------- the haunted house ----------
   Three rooms, all of them worth entering. The pick is a second, smaller write: it doesn't touch
   `last`, so it doesn't collide with the knock cooldown the rules enforce on that field. */
function totHaunt(){
  const box=document.getElementById('totResult');
  if(!box)return;
  _totHaunt=true;
  const mult=totMult()*((Number(TOT_ME.bag)||0)?1.15:1)*totRainX();
  const pots=[totRand(300,560),totRand(110,190),totRand(110,190)]
    .map(v=>Math.round(v*mult));
  for(let i=pots.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pots[i],pots[j]]=[pots[j],pots[i]]}
  const ROOMS=[{ic:'🚪',n:'The cellar'},{ic:'🪜',n:'The attic'},{ic:'🕯️',n:'The parlour'}];
  box.className='tot-res haunt';
  box.innerHTML=`<div class="tot-haunt">
    <b>🏚️ Pick a room</b><small>All three have something. One has a lot.</small>
    <div class="tot-rooms">${ROOMS.map((r,i)=>
      `<button type="button" class="tot-room" data-room="${i}"><span>${r.ic}</span><em>${esc(r.n)}</em></button>`).join('')}</div>
  </div>`;
  box.querySelectorAll('[data-room]').forEach(b=>b.onclick=async()=>{
    if(!_totHaunt)return;
    _totHaunt=false;
    const i=Number(b.dataset.room),pay=pots[i];
    /* Only the room you went into shows its number. Revealing the other two would turn a free
       bonus into a near-miss — the whole point is that going in is never a bet. */
    box.querySelectorAll('[data-room]').forEach((o,n)=>{
      o.disabled=true;o.classList.add(n===i?'took':'shown');
      if(n===i)o.insertAdjacentHTML('beforeend','<i>🍬 '+totNum(pay)+'</i>');
    });
    const patch={
      candy:Math.max(0,Math.min(TOT.MAX,TOT_ME.candy+pay)),
      earned:Math.min(TOT.MAX*5,(Number(TOT_ME.earned)||0)+pay),
      best:Math.max(Number(TOT_ME.best)||0,pay),
      name:String(ME.username||'').slice(0,20)
    };
    const a=totGrant([patch.candy>=1000?'rich':'',patch.candy>=5000?'rich5':'']);
    if(a)patch.ach=a;
    TOT_ME={...TOT_ME,...patch};
    toast('🏚️ You came out with '+totNum(pay)+' candy.');
    if(pay>=300&&typeof burstConfetti==='function')burstConfetti(100);
    totPaint();
    try{await totSave(patch)}catch(e){toast('That didn\'t save ('+(e.code||e.message)+')','bad')}
  });
}

function totShowResult(d,gain,lost,note,golden,doorEl){
  const box=document.getElementById('totResult');
  if(doorEl){doorEl.classList.remove('knock');void doorEl.offsetWidth;doorEl.classList.add('knock','used')}
  if(!box)return;
  const cls='tot-res '+(gain&&!lost?'good':'')+(lost?' bad':'')+(d.k==='jack'?' jack':'');
  box.className=cls;
  box.innerHTML=`<span class="tot-res-ic">${d.ic}</span>
    <div class="tot-res-tx"><b>${esc(d.t)}</b><small>${esc(note)}</small></div>
    <span class="tot-res-n">${gain?('+'+totNum(gain)):''}${lost?('−'+totNum(lost)):''}${(!gain&&!lost)?'0':''}</span>`;
  box.classList.remove('pop');void box.offsetWidth;box.classList.add('pop');
  if(golden&&gain)toast('✨ Golden wrapper doubled it!');
}

/* ---------- minigames ---------- */
let _totGameStop=null;
function totPlay(id){
  const g=(typeof TOT_GAMES!=='undefined'?TOT_GAMES:[]).find(x=>x.id===id);
  const host=document.getElementById('totGameHost');
  if(!g||!host)return;
  if(!totLive()){toast('The event is over.','bad');return}
  if(totGameCd()>0)return;
  if(_totGameStop){try{_totGameStop()}catch(_){}_totGameStop=null}
  host.classList.add('playing');
  _totGameStop=g.run(host,async(score)=>{
    _totGameStop=null;
    const pay=Math.max(0,Math.round(g.payout(score))*totRainX());
    const candy=Math.max(0,Math.min(TOT.MAX,TOT_ME.candy+pay));
    const hiKey='hi_'+g.id;
    const patch={
      candy,
      earned:Math.min(TOT.MAX*5,(Number(TOT_ME.earned)||0)+pay),
      games:(Number(TOT_ME.games)||0)+1,
      lastg:Math.round(totNow()),
      name:String(ME.username||'').slice(0,20)
    };
    patch[hiKey]=g.id==='memory'
      ? Math.min(9999,(Number(TOT_ME[hiKey])||9999)===0?score:Math.min(Number(TOT_ME[hiKey])||9999,score))
      : Math.max(Number(TOT_ME[hiKey])||0,score);
    const played=new Set(String(TOT_ME.played||'').split(',').filter(Boolean));played.add(g.id);
    patch.played=[...played].join(',').slice(0,60);
    const a=totGrant([g.ach(score),candy>=1000?'rich':'',candy>=5000?'rich5':'',
      totRainOn()?'rain':'',played.size>=TOT_GAMES.length?'allg':'']);
    if(a)patch.ach=a;
    TOT_ME={...TOT_ME,...patch};
    host.classList.remove('playing');
    host.innerHTML=`<div class="totg-done"><span>${g.ic}</span><b>+${totNum(pay)} candy</b>
      <small>${esc(g.unit(score))}</small>
      <button type="button" class="btn sec small" id="totGameBack">Back to the games</button></div>`;
    const bk=document.getElementById('totGameBack');if(bk)bk.onclick=()=>{totBody();totPaint()};
    if(pay>=300&&typeof burstConfetti==='function')burstConfetti(80);
    try{await totSave(patch)}catch(e){toast('Score didn\'t save ('+(e.code||e.message)+')','bad')}
    totPaint();
  });
  totPaint();
}
function totGamesHTML(){
  if(!totLive())return `<div class="tot-over"><span>🕯️</span><b>The games are closed</b><p>Everything shut at midnight.</p>
    <button class="btn" type="button" data-tot-go="board">See the leaderboard</button></div>`;
  const list=(typeof TOT_GAMES!=='undefined'?TOT_GAMES:[]).map(g=>{
    const hi=Number(TOT_ME['hi_'+g.id])||0;
    const hiTx=hi?(g.id==='memory'?('Best '+hi+'s'):('Best '+totNum(hi))):'Not played yet';
    return `<button type="button" class="tot-game" data-play="${g.id}">
      <span class="tot-game-ic">${g.ic}</span>
      <span class="tot-game-tx"><b>${esc(g.n)}</b><small>${esc(g.d)}</small></span>
      <span class="tot-game-hi">${esc(hiTx)}</span></button>`;
  }).join('');
  return `<div class="hint">Nine games, pure skill, up to 500 candy each, nothing to lose. One every ${Math.round(totGameMs()/1000)}s.</div>
    <div class="tot-games" id="totGames">${list}</div>
    <div class="tot-gamecd" id="totGameCd"></div>
    <div id="totGameHost"></div>`;
}

/* ---------- shop + the free hourly bonus ---------- */
async function totBuy(id){
  const it=TOT_SHOP.find(x=>x.id===id);if(!it||!ME)return;
  if(!totLive()){toast('The shop is closed.','bad');return}
  if(TOT_ME.candy<it.cost){toast('Not enough candy — you need '+totNum(it.cost)+'.','bad');return}
  if(it.once&&(Number(TOT_ME.bag)||0)){toast('You already have that.','bad');return}
  const patch={candy:Math.max(0,TOT_ME.candy-it.cost),name:String(ME.username||'').slice(0,20)};
  if(id==='rush')patch.rush=Math.round(totNow()+180000);
  if(id==='luck')patch.luck=10;
  if(id==='bag')patch.bag=1;
  TOT_ME={...TOT_ME,...patch};
  toast(it.ic+' '+it.n+' bought!');
  totBody();totPaint();
  try{await totSave(patch)}catch(e){toast('Purchase didn\'t save ('+(e.code||e.message)+')','bad')}
}
async function totBonus(){
  if(!ME||!totLive()||totBonusCd()>0)return;
  const pay=totRand(120,260);
  const patch={
    candy:Math.max(0,Math.min(TOT.MAX,TOT_ME.candy+pay)),
    earned:Math.min(TOT.MAX*5,(Number(TOT_ME.earned)||0)+pay),
    bonus:Math.round(totNow()),
    name:String(ME.username||'').slice(0,20)
  };
  TOT_ME={...TOT_ME,...patch};
  toast('🔔 Doorbell bonus: +'+totNum(pay)+' candy');
  if(typeof burstConfetti==='function')burstConfetti(40);
  totPaint();
  try{await totSave(patch)}catch(e){toast('Bonus didn\'t save ('+(e.code||e.message)+')','bad')}
}
/* ---------- costumes ---------- */
async function totFitBuy(id){
  const f=TOT_FITS.find(x=>x.id===id);if(!f||!ME)return;
  if(totOwnsFit(id)){totFitWear(id);return}
  if(!totLive()){toast('The shop is closed.','bad');return}
  if(TOT_ME.candy<f.cost){toast('Not enough candy — you need '+totNum(f.cost)+'.','bad');return}
  const owned=String(TOT_ME.fits||'').split(',').filter(Boolean);owned.push(id);
  const patch={candy:Math.max(0,TOT_ME.candy-f.cost),fits:owned.join(',').slice(0,60),fit:id,
               name:String(ME.username||'').slice(0,20)};
  const a=totGrant(['fit']);if(a)patch.ach=a;
  TOT_ME={...TOT_ME,...patch};
  toast(f.ic+' You are now a '+f.n+'.');
  if(typeof burstConfetti==='function')burstConfetti(50);
  totBody();totPaint();
  try{await totSave(patch)}catch(e){toast('Costume didn\'t save ('+(e.code||e.message)+')','bad')}
}
async function totFitWear(id){
  if(!ME||(id&&!totOwnsFit(id)))return;
  const patch={fit:TOT_ME.fit===id?'':id,name:String(ME.username||'').slice(0,20)};
  TOT_ME={...TOT_ME,...patch};
  totBody();totPaint();
  try{await totSave(patch)}catch(e){toast('Didn\'t save ('+(e.code||e.message)+')','bad')}
}

/* ---------- challenges ---------- */
async function totClaim(id){
  const q=TOT_QUESTS.find(x=>x.id===id);if(!q||!ME)return;
  if(totQDone(id)||q.at(TOT_ME)<1)return;
  const done=String(TOT_ME.qc||'').split(',').filter(Boolean);done.push(id);
  const patch={
    candy:Math.max(0,Math.min(TOT.MAX,TOT_ME.candy+q.pay)),
    earned:Math.min(TOT.MAX*5,(Number(TOT_ME.earned)||0)+q.pay),
    qc:done.join(',').slice(0,120),
    name:String(ME.username||'').slice(0,20)
  };
  const a=totGrant([patch.candy>=1000?'rich':'',patch.candy>=5000?'rich5':'',
    done.length>=TOT_QUESTS.length?'quests':'']);
  if(a)patch.ach=a;
  TOT_ME={...TOT_ME,...patch};
  toast(q.ic+' '+q.n+' — +'+totNum(q.pay)+' candy');
  if(typeof burstConfetti==='function')burstConfetti(60);
  totBody();totPaint();
  try{await totSave(patch)}catch(e){toast('Claim didn\'t save ('+(e.code||e.message)+')','bad')}
}
function totQuestHTML(){
  const done=TOT_QUESTS.filter(q=>totQDone(q.id)).length;
  const rows=TOT_QUESTS.map(q=>{
    const p=Math.max(0,Math.min(1,q.at(TOT_ME)||0)),was=totQDone(q.id),can=!was&&p>=1;
    return `<div class="tot-q${was?' done':''}${can?' ready':''}">
      <span class="tot-q-ic">${q.ic}</span>
      <div class="tot-q-tx"><b>${esc(q.n)}</b><small>${esc(q.d)}</small>
        <span class="tot-q-bar"><i style="width:${Math.round(p*100)}%"></i></span></div>
      <button type="button" class="btn sec small" data-claim="${q.id}"${can?'':' disabled'}>
        ${was?'✓ Claimed':(can?('Claim 🍬 '+totNum(q.pay)):('🍬 '+totNum(q.pay)))}</button>
    </div>`;
  }).join('');
  return `<div class="hint">Challenges track themselves while you play — come back and cash them in.
    <b>${done} of ${TOT_QUESTS.length}</b> done.</div>
    <div class="tot-quests">${rows}</div>`;
}
function totShopHTML(){
  const owned=id=>id==='bag'&&(Number(TOT_ME.bag)||0);
  return `<div class="hint">Spend candy to collect it faster. The bucket is permanent — it pays for itself if you buy it early.</div>
  <div class="tot-shop">${TOT_SHOP.map(it=>`<div class="tot-item${owned(it.id)?' owned':''}">
    <span class="tot-item-ic">${it.ic}</span>
    <div class="tot-item-tx"><b>${esc(it.n)}</b><small>${esc(it.d)}</small></div>
    <button type="button" class="btn sec small" data-buy="${it.id}"${owned(it.id)?' disabled':''}>${owned(it.id)?'Owned':('🍬 '+totNum(it.cost))}</button>
  </div>`).join('')}</div>
  <div class="tot-ach-h">Costumes <span>shows next to your name on the board</span></div>
  <div class="tot-fits">${TOT_FITS.map(f=>{
    const have=totOwnsFit(f.id),on=TOT_ME.fit===f.id;
    return `<button type="button" class="tot-fit${have?' have':''}${on?' on':''}" data-fit="${f.id}">
      <span>${f.ic}</span><b>${esc(f.n)}</b>
      <small>${on?'Wearing':(have?'Tap to wear':('🍬 '+totNum(f.cost)))}</small></button>`;
  }).join('')}</div>
  <div class="tot-ach-h">Collection <span id="totAchN"></span></div>
  <div class="tot-ach">${TOT_ACH.map(a=>`<div class="tot-ach-i${totHas(a.id)?' on':''}" title="${esc(a.d)}">
    <span>${a.ic}</span><b>${esc(a.n)}</b><small>${esc(a.d)}</small></div>`).join('')}</div>`;
}

/* ---------- the panel ---------- */
function totOpen(tab){
  if(!ME)return;
  _totTab=tab||(totLive()?'street':'board');
  totWatch();
  const root=$('#modalRoot');
  root.innerHTML=`<div class="modal-bg" id="totBg"><div class="modal tot-modal">
    <button class="modal-x" id="totX" type="button" aria-label="Close">✕</button>
    <div class="tot-head">
      <div class="tot-title"><span class="tot-pump">🎃</span><div><h2>Trick or Treat</h2><small id="totClock"></small></div></div>
      <div class="tot-bucket"><span>🍬</span><b id="totCandy">0</b><small>candy</small></div>
    </div>
    <div class="tot-tabs" role="tablist">
      <button type="button" class="tot-tab" data-tot="street">🚪 Street</button>
      <button type="button" class="tot-tab" data-tot="games">🕹️ Minigames</button>
      <button type="button" class="tot-tab" data-tot="quests">📜 Challenges<i class="tot-dot" id="totQDot"></i></button>
      <button type="button" class="tot-tab" data-tot="shop">🛒 Shop</button>
      <button type="button" class="tot-tab" data-tot="board">🏆 Board</button>
    </div>
    <div id="totBody"></div>
  </div></div>`;
  $('#totX').onclick=totClose;
  $('#totBg').onclick=e=>{if(e.target.id==='totBg')totClose()};
  root.querySelectorAll('[data-tot]').forEach(b=>b.onclick=()=>{
    if(_totGameStop){try{_totGameStop()}catch(_){}_totGameStop=null}
    _totHaunt=false;                       // leaving the street forfeits an unpicked room
    _totTab=b.dataset.tot;totBody();totPaint();
  });
  totBody();totPaint();
  clearInterval(_totTimer);_totTimer=setInterval(totPaint,250);
  try{localStorage.setItem('ich.tot.seen','1')}catch(_){}
}
function totClose(){
  clearInterval(_totTimer);_totTimer=null;_totHaunt=false;
  if(_totGameStop){try{_totGameStop()}catch(_){}_totGameStop=null}
  const bg=$('#totBg');if(!bg){if($('#modalRoot'))$('#modalRoot').innerHTML='';return}
  bg.classList.add('closing');
  setTimeout(()=>{if($('#modalRoot'))$('#modalRoot').innerHTML=''},200);
}
function totBody(){
  const b=document.getElementById('totBody');if(!b)return;
  document.querySelectorAll('[data-tot]').forEach(x=>x.classList.toggle('on',x.dataset.tot===_totTab));
  if(_totTab==='street')b.innerHTML=totStreetHTML();
  else if(_totTab==='games')b.innerHTML=totGamesHTML();
  else if(_totTab==='quests')b.innerHTML=totQuestHTML();
  else if(_totTab==='shop')b.innerHTML=totShopHTML();
  else b.innerHTML=totBoardHTML();
  totWire();
}
function totStreetHTML(){
  if(!totLive())return `<div class="tot-over"><span>🌙</span><b>Trick-or-treating is over</b><p>The street went quiet at midnight. The leaderboard is still up — check where you landed.</p>
    <button class="btn" type="button" data-tot-go="board">See the leaderboard</button></div>`;
  const houses=['🏚️','🏠','🏡','🏘️'];
  return `<div class="tot-rain" id="totRain"></div>
  <div class="tot-street">
    ${houses.map((h,i)=>`<button type="button" class="tot-door" data-door="${i}" style="--i:${i}">
      <span class="tot-house">${h}</span><span class="tot-knob"></span><span class="tot-knock-t">Knock</span></button>`).join('')}
  </div>
  <div class="tot-res" id="totResult"><span class="tot-res-ic">🚪</span><div class="tot-res-tx"><b>Pick a house</b><small>Knock on any door. Some give out full-size bars. Some do not give out anything.</small></div><span class="tot-res-n"></span></div>
  <div class="tot-stats">
    <div><label>Streak</label><b id="totStreak">0</b></div>
    <div><label>Doors</label><b id="totDoors">0</b></div>
    <div><label>Best haul</label><b id="totBest">0</b></div>
    <div><label>Rank</label><b id="totRank">—</b></div>
  </div>
  <div class="tot-cd" id="totCdWrap"><i id="totCdBar"></i><span id="totCdTx"></span></div>
  <button type="button" class="tot-bonus" id="totBonusBtn"></button>`;
}
function totBoardHTML(){
  const rows=totBoard(),me=ME?totRankOf(ME.id):0;
  const over=!totLive();
  const medal=i=>['🥇','🥈','🥉','4️⃣','5️⃣'][i]||('#'+(i+1));
  const head=over
    ?`<div class="tot-final"><b>🏆 Final standings</b><span>Collecting closed at midnight. Top ${TOT.WINNERS} get rewarded.</span></div>`
    :`<div class="tot-final live"><b>🔴 Live</b><span>Still running — the top ${TOT.WINNERS} at midnight get rewarded.</span></div>`;
  if(!rows.length)return head+`<div class="tot-empty">Nobody has any candy yet. Be the first.</div>`;
  const list=rows.slice(0,25).map((r,i)=>{
    const mine=ME&&r.id===ME.id;
    return `<div class="tot-row${i<TOT.WINNERS?' win':''}${mine?' me':''}">
      <span class="tot-pos">${medal(i)}</span>
      <span class="tot-nm">${r.fit?('<span class="tot-fit-ic" title="costume">'+totFitOf(r.fit)+'</span> '):''}${esc(totName(r.id))}${mine?' <em>(you)</em>':''}</span>
      <span class="tot-sub">${totNum(r.doors)} doors</span>
      <span class="tot-candy">🍬 ${totNum(r.candy)}</span>
      ${(over&&i<TOT.WINNERS&&typeof isOwner==='function'&&ME&&isOwner(ME.id)&&!isOwner(r.id))?`<button type="button" class="btn sec small tot-rw" data-reward="${r.id}">Give VIP</button>`:''}
    </div>`;
  }).join('');
  const mine=me?`<div class="tot-yours">You are <b>#${me}</b> of ${rows.length} with <b>🍬 ${totNum(TOT_ME.candy)}</b>.</div>`
                :`<div class="tot-yours">You are not on the board yet.</div>`;
  return head+`<div class="tot-board">${list}</div>${mine}`+
    ((ME&&typeof isOwner==='function'&&isOwner(ME.id))
      ?`<button type="button" class="btn sec small tot-ann" id="totAnnounce">📢 Announce this event to everyone</button>`:'');
}
function totWire(){
  const b=document.getElementById('totBody');if(!b)return;
  b.querySelectorAll('[data-door]').forEach(d=>d.onclick=()=>totKnock(d));
  b.querySelectorAll('[data-tot-go]').forEach(x=>x.onclick=()=>{_totTab=x.dataset.totGo;totBody();totPaint()});
  b.querySelectorAll('[data-play]').forEach(x=>x.onclick=()=>totPlay(x.dataset.play));
  b.querySelectorAll('[data-buy]').forEach(x=>x.onclick=()=>totBuy(x.dataset.buy));
  b.querySelectorAll('[data-fit]').forEach(x=>x.onclick=()=>totFitBuy(x.dataset.fit));
  b.querySelectorAll('[data-claim]').forEach(x=>x.onclick=()=>totClaim(x.dataset.claim));
  const bon=document.getElementById('totBonusBtn');if(bon)bon.onclick=totBonus;
  b.querySelectorAll('[data-reward]').forEach(x=>x.onclick=async()=>{
    const id=Number(x.dataset.reward);x.disabled=true;x.textContent='Giving…';
    try{await DB.giveVip(id,'perm');toast(totName(id)+' is now a Legend (permanent VIP).');x.textContent='✓ Rewarded'}
    catch(e){toast(e.message||'Failed','bad');x.disabled=false;x.textContent='Give VIP'}
  });
  const ann=document.getElementById('totAnnounce');
  if(ann)ann.onclick=async()=>{
    ann.disabled=true;ann.textContent='Sending…';
    try{
      await DB.sendLiveAnnouncement('🎃 TRICK OR TREAT is live! Knock on doors for candy, play the NINE minigames, finish challenges and buy a costume. 🌧️ CANDY RAIN doubles everything for 5 minutes every half hour. It ends at MIDNIGHT tonight — top 5 get rewarded. Open it from the home screen.',{kind:'event',alsoPost:true});
      toast('Announced to everyone.');ann.textContent='✓ Announced';
    }catch(e){toast(e.message||'Could not announce','bad');ann.disabled=false;ann.textContent='📢 Announce this event to everyone'}
  };
}
// One repaint for everything live: the clock, the bucket, the cooldown ring, the shop buttons.
function totPaint(){
  const c=document.getElementById('totCandy');if(c)c.textContent=totNum(TOT_ME.candy);
  // Candy Rain: the same five minutes for everybody, worked out from the clock alone.
  const rain=document.getElementById('totRain');
  if(rain){
    const on=totRainOn();
    rain.classList.toggle('on',on);
    rain.innerHTML=on
      ? `<span class="tot-rain-ic">🌧️</span><div><b>CANDY RAIN — everything pays double</b>
         <small>Ends in ${totMs(totRainLeft())}. Knock as fast as you can.</small></div>`
      : `<span class="tot-rain-ic">⏳</span><div><b>Candy Rain in ${totMs(totRainIn())}</b>
         <small>Five minutes of double candy, every half hour, for everyone at once.</small></div>`;
  }
  const qd=document.getElementById('totQDot');
  if(qd){const n=totQCount();qd.textContent=n?n:'';qd.classList.toggle('on',n>0)}
  const clock=document.getElementById('totClock');
  if(clock){
    const left=TOT.END-totNow();
    clock.textContent=left>0
      ?('Ends in '+(typeof fmtDur==='function'?fmtDur(left):Math.round(left/60000)+'m')+' · midnight Texas time')
      :'Collecting has ended · leaderboard open until Nov 5';
  }
  const st=document.getElementById('totStreak');
  if(st){
    st.textContent=TOT_ME.streak+(TOT_ME.streak>0?' ×'+totMult().toFixed(2).replace(/0$/,''):'');
    const dd=document.getElementById('totDoors');if(dd)dd.textContent=totNum(TOT_ME.doors);
    const bb=document.getElementById('totBest');if(bb)bb.textContent=totNum(TOT_ME.best);
    const rk=document.getElementById('totRank');if(rk){const r=ME?totRankOf(ME.id):0;rk.textContent=r?('#'+r):'—'}
  }
  const cd=totCd(),bar=document.getElementById('totCdBar'),tx=document.getElementById('totCdTx'),wrap=document.getElementById('totCdWrap');
  if(bar&&tx&&wrap){
    wrap.classList.toggle('ready',cd<=0);
    bar.style.width=(100-Math.round(cd/TOT.KNOCK_MS*100))+'%';
    const buffs=[];
    if(totRainOn())buffs.push('🌧️ RAIN ×2');
    if(totRushOn())buffs.push('⚡ Sugar Rush');
    if((Number(TOT_ME.luck)||0)>0)buffs.push('🍀 Lucky ×'+TOT_ME.luck);
    if((Number(TOT_ME.golden)||0)>0)buffs.push('✨ Golden ×'+TOT_ME.golden);
    if((Number(TOT_ME.bag)||0))buffs.push('🎒 +15%');
    tx.textContent=cd>0?('Next knock in '+(cd/1000).toFixed(1)+'s')
      :(buffs.length?buffs.join('  ·  '):'Ready — pick a door');
  }
  document.querySelectorAll('[data-door]').forEach(d=>{d.disabled=cd>0||_totBusy||!totLive()});
  const bon=document.getElementById('totBonusBtn');
  if(bon){
    const w=totBonusCd();
    bon.disabled=w>0;
    bon.className='tot-bonus'+(w>0?'':' ready');
    bon.innerHTML=w>0?('🔔 Next doorbell bonus in '+(typeof fmtDur==='function'?fmtDur(w):Math.ceil(w/60000)+'m'))
                     :'🔔 Free doorbell bonus — claim it';
  }
  const gcd=document.getElementById('totGameCd');
  if(gcd){
    const w=totGameCd();
    gcd.textContent=w>0?('Next game in '+(w/1000).toFixed(0)+'s'):'Ready to play';
    gcd.classList.toggle('ready',w<=0);
    document.querySelectorAll('[data-play]').forEach(x=>{x.disabled=w>0||!totLive()});
  }
  const an=document.getElementById('totAchN');
  if(an)an.textContent=String(TOT_ME.ach||'').split(',').filter(Boolean).length+' / '+TOT_ACH.length;
  document.querySelectorAll('[data-buy]').forEach(x=>{
    const it=TOT_SHOP.find(i=>i.id===x.dataset.buy);
    if(it&&!(it.once&&(Number(TOT_ME.bag)||0)))x.disabled=TOT_ME.candy<it.cost||!totLive();
  });
}

/* ---------- getting everyone into it ----------
   A tile on the home screen, a bar across the top of chat, and a one-time popup. */
function totBadgeHTML(){
  const left=TOT.END-totNow();
  if(!totLive())return 'Final results';
  // Candy Rain takes over the badge while it is on — it is the thing worth interrupting for.
  if(totRainOn())return '<span class="tot-live-dot rain"></span>🌧️ CANDY RAIN · '+totMs(totRainLeft());
  return '<span class="tot-live-dot"></span>'+(typeof fmtDur==='function'?fmtDur(left):'')+' left';
}
function totInjectHome(){
  const opts=document.querySelector('#homePage .options');
  if(!opts||!totVisible())return;
  let t=document.getElementById('goTrickOrTreat');
  if(!t){
    t=document.createElement('button');
    t.className='opt tot-opt';t.id='goTrickOrTreat';t.type='button';
    t.innerHTML='<div class="ic">🎃</div><h3>Trick or Treat</h3><p id="totOptSub">Halloween event</p><span class="tot-opt-glow"></span>';
    t.onclick=()=>totOpen();
    opts.insertBefore(t,opts.firstChild);
  }
  const sub=document.getElementById('totOptSub');
  if(sub)sub.innerHTML=totBadgeHTML();
}
function totInjectChatBar(){
  if(!totVisible())return;
  const anchor=document.querySelector('#chatPage .vip-bar');
  if(!anchor||!anchor.parentNode)return;
  let b=document.getElementById('totBar');
  if(!b){
    b=document.createElement('button');
    b.type='button';b.id='totBar';b.className='tot-bar';
    b.onclick=()=>totOpen();
    anchor.parentNode.insertBefore(b,anchor);
  }
  const live=totLive(),rain=totRainOn();
  b.classList.toggle('raining',rain);
  b.innerHTML=`<span class="tot-bar-ic">${rain?'🌧️':'🎃'}</span><span class="tot-bar-tx"><b>${
      !live?'Trick or Treat — final results':(rain?'CANDY RAIN — everything pays double':'Trick or Treat is live')}</b>
    <small>${!live?'See where you placed'
      :(rain?('Ends in '+totMs(totRainLeft())+' — knock as fast as you can')
            :('Nine minigames, challenges, costumes · next Candy Rain in '+totMs(totRainIn())))}</small></span>
    <span class="tot-bar-go">${live?totBadgeHTML():'Open'}</span>`;
}
// Shown once per account, so nobody misses that the event exists.
function totMaybeIntro(){
  if(!ME||!totLive())return;
  let seen=false;try{seen=localStorage.getItem('ich.tot.intro.'+ME.id)==='1'}catch(_){}
  if(seen)return;
  const root=document.getElementById('modalRoot');
  if(!root||root.innerHTML.trim()!==''||(typeof view!=='undefined'&&view.page==='authPage'))return;
  try{localStorage.setItem('ich.tot.intro.'+ME.id,'1')}catch(_){}
  root.innerHTML=`<div class="modal-bg" id="totIntroBg"><div class="modal tot-intro">
    <button class="modal-x" id="totIntroX" type="button" aria-label="Close">✕</button>
    <span class="tot-intro-moon">🌕</span>
    <div class="tot-intro-pump">🎃</div>
    <h2>Trick or Treat</h2>
    <p class="tot-intro-lead">It's Halloween. Knock on doors around the site for candy, play <b>nine minigames</b>, finish challenges, buy a costume and get on the leaderboard.</p>
    <div class="tot-intro-grid">
      <div><span>🚪</span><b>Knock</b><small>Full-size bars, jackpot houses and a haunted one.</small></div>
      <div><span>🕹️</span><b>Play</b><small>Nine minigames. Pure skill, nothing to lose.</small></div>
      <div><span>🌧️</span><b>Candy Rain</b><small>Everything pays double, 5 minutes every half hour.</small></div>
      <div><span>📜</span><b>Challenges</b><small>Milestones that pay out, plus costumes to buy.</small></div>
      <div><span>🏆</span><b>Win</b><small>Top 5 at midnight get rewarded.</small></div>
      <div><span>🔔</span><b>Come back</b><small>A free doorbell bonus every hour.</small></div>
    </div>
    <div class="tot-intro-end">Ends at <b>midnight tonight</b>, Texas time.</div>
    <div class="actions"><button class="btn sec" id="totIntroLater" type="button">Later</button><button class="btn" id="totIntroGo" type="button">🍬 Start trick-or-treating</button></div>
  </div></div>`;
  // dismissible every way a dialog should be: the button, the ✕, the backdrop and Escape
  // (the Escape handler in js/ui/keyboard-shortcuts.js looks for a .modal-x)
  const shut=()=>{root.innerHTML=''};
  document.getElementById('totIntroGo').onclick=()=>{shut();totOpen('street')};
  document.getElementById('totIntroLater').onclick=shut;
  document.getElementById('totIntroX').onclick=shut;
  document.getElementById('totIntroBg').onclick=e=>{if(e.target.id==='totIntroBg')shut()};
}

/* ---------- keeping every entry point on screen ----------
   This deliberately does NOT rely on DB.onChange alone. Those fire while the app is starting up,
   and on a quiet account they can all land BEFORE boot.js assigns ME — in which case every one of
   them bails out and the tile never appears at all (reproduced: it showed on one load and not the
   next). So a small ticker drives it too: once a second until we are signed in and the entry
   points exist, then every 15s to keep the countdown fresh. */
function totSync(){
  if(typeof ME==='undefined'||!ME)return false;
  totWatch();
  try{totInjectHome();totInjectChatBar();totMaybeIntro()}catch(e){console.warn('[tot]',e)}
  return true;
}
if(typeof DB!=='undefined'&&DB.onChange)DB.onChange(()=>{totSync()});
(function totTick(){
  let ok=false;
  try{ok=totSync()}catch(_){}
  setTimeout(totTick,ok?15000:1000);
})();
