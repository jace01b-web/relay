/* ==========================================================================
 * js/settings/rules.js
 * Rules modal and agreement tracking
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Rules ---------- */
const RULES=[
  {ic:'🚫',hot:true,t:'No talk about VUS',d:'Any talk about <b>VUS</b> will result in up to a <b>ban</b>.'},
  {ic:'🌈',t:'No racism',d:'No racism, slurs, or hate speech toward anyone. Everyone is welcome here.'},
  {ic:'🔞',t:'No NSFW',d:'No NSFW images or messages. Images are scanned automatically: flagged images are deleted and you are <b>muted for 1 hour</b> every time.'},
  {ic:'💗',t:'Be kind',d:'No harassment, bullying, threats, or targeting people. Disagree politely.'},
  {ic:'📢',t:'No spam',d:'No flooding, advertising, scams, or sketchy links.'},
  {ic:'🔒',t:'Protect privacy',d:'Never share anyone\'s personal info (doxxing), and keep your own safe too.'},
  {ic:'🛡️',t:'Respect staff',d:'Listen to owners and mods. Evading a mute or ban (alt accounts) will get you banned.'},
  {ic:'✨',t:'And everything else',d:'Use common sense. Staff can act on anything that ruins the vibe, even if it isn\'t listed.'}
];
const RULES_VERSION=1;       // bump this number to make everyone re-agree after you change the rules
let RULES_STATE;              // undefined = not loaded yet, null = never agreed, {v,at} = agreed
function rulesAgreed(st){return !!(st&&Number(st.v)>=RULES_VERSION)}
function fmtRulesDate(t){try{return new Date(t).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}catch(_){return ''}}
function modalRules(opts){
  opts=opts||{};
  const root=$('#modalRoot');if(!root)return;
  const force=!!opts.force;
  const agreed=rulesAgreed(RULES_STATE);
  const needAgree=force||!agreed;
  const mascot=`<svg class="rules-mascot" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M18 44 L22 8 L46 26 Z" fill="#ffe3f2" stroke="#7a3d86" stroke-width="3" stroke-linejoin="round"/>
    <path d="M82 44 L78 8 L54 26 Z" fill="#ffe3f2" stroke="#7a3d86" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 36 L26 18 L38 28 Z" fill="#ff9ccb"/><path d="M76 36 L74 18 L62 28 Z" fill="#ff9ccb"/>
    <ellipse cx="50" cy="58" rx="36" ry="33" fill="#fff4fa" stroke="#7a3d86" stroke-width="3"/>
    <ellipse cx="36" cy="58" rx="9" ry="12" fill="#3a2a6e"/><ellipse cx="64" cy="58" rx="9" ry="12" fill="#3a2a6e"/>
    <ellipse cx="36" cy="58" rx="6" ry="9" fill="#7c6cff"/><ellipse cx="64" cy="58" rx="6" ry="9" fill="#7c6cff"/>
    <circle cx="39" cy="53" r="3.6" fill="#fff"/><circle cx="67" cy="53" r="3.6" fill="#fff"/>
    <circle cx="33" cy="63" r="1.6" fill="#fff"/><circle cx="61" cy="63" r="1.6" fill="#fff"/>
    <ellipse cx="22" cy="70" rx="6" ry="3.6" fill="#ff8fc0" opacity=".7"/><ellipse cx="78" cy="70" rx="6" ry="3.6" fill="#ff8fc0" opacity=".7"/>
    <path d="M44 72 Q50 79 56 72" fill="none" stroke="#7a3d86" stroke-width="3" stroke-linecap="round"/>
    <path d="M86 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#fff"/>
  </svg>`;
  const footer=needAgree
    ?`<label class="rules-agree"><input type="checkbox" id="rulesChk"> I have read the rules and I agree to follow them</label>
      <button class="rules-ok" id="rulesOk" type="button" disabled>Agree &amp; continue 💖</button>`
    :`<div class="rules-status">✅ You agreed to these rules${RULES_STATE&&RULES_STATE.at?' on '+fmtRulesDate(RULES_STATE.at):''}</div>
      <button class="rules-ok" id="rulesOk" type="button">${opts.back?'Back':'Close'} 💖</button>`;
  root.innerHTML=`<div class="modal-bg" id="rulesBg"><div class="modal rules-modal" role="dialog" aria-modal="true" aria-label="Server rules">
    ${force?'':'<button class="modal-x" id="rulesX" type="button">✕</button>'}
    <div class="rules-hero">
      <i class="rl-petal"></i><i class="rl-petal"></i><i class="rl-petal"></i><i class="rl-petal"></i><i class="rl-petal"></i><i class="rl-petal"></i><i class="rl-petal"></i><i class="rl-petal"></i>
      ${mascot}
      <h2>Server Rules</h2>
      <div class="rules-jp">ルール ✦ ようこそ！</div>
      <div class="rules-sub">${force?'You need to agree to the rules to keep chatting ✨':'Please read before chatting ✨'}</div>
    </div>
    <div class="rules-body">
      ${RULES.map((r,i)=>`<div class="rule-card${r.hot?' rule-hot':''}"><div class="rule-ic">${r.ic}</div><div><div class="rule-t"><span class="rule-n">#${i+1}</span>${r.t}</div><div class="rule-d">${r.d}</div></div></div>`).join('')}
      <div class="rules-foot">Breaking the rules can lead to <b>message deletion</b> → <b>mute</b> → <b>ban</b>, depending on how serious it is.</div>
      ${footer}
    </div>
  </div></div>`;
  const leave=()=>closeModalAnimated(root,opts.back||null);
  if(!force){
    $('#rulesX').onclick=leave;
    $('#rulesBg').onclick=e=>{if(e.target.id==='rulesBg')leave()};
  }
  if(!needAgree){$('#rulesOk').onclick=leave;return}
  const chk=$('#rulesChk'),ok=$('#rulesOk');
  chk.onchange=()=>{ok.disabled=!chk.checked};
  ok.onclick=async()=>{
    if(!chk.checked||ok.disabled)return;
    ok.disabled=true;ok.textContent='Saving…';
    try{
      await DB.agreeRules(RULES_VERSION);
      RULES_STATE={v:RULES_VERSION,at:Date.now()+SKEW};
      toast('Thanks for agreeing to the rules! 💖');
    }catch(e){
      console.warn('rules agreement not saved',e);
      toast('Could not save your agreement. You may be asked again next time.','bad');
    }
    leave();
  };
}
$('#rulesBtn').onclick=()=>modalRules();
/* HALLOWEEN:START ===== Halloween event: season pass + decorations. Delete everything between HALLOWEEN:START and HALLOWEEN:END (this block, the CSS block and the listener line) to remove the event. =====
   Progress = minutes logged in and connected (AFK is fine). Level n needs 2n²+13n total minutes (15m for level 1, +4m more per level).
   Claimed level is stored at halloween/claimed/<id>; everything at or below that level is owned. Server rules: halloween-rules-block.json */
