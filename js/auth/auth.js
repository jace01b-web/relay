/* ==========================================================================
 * js/auth/auth.js
 * Sign in / sign up / Google sign-in wiring
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- Auth UI ---------- */
$('#tabIn').onclick=()=>authTab('in');
$('#tabUp').onclick=()=>authTab('up');
function authTab(t){
  $('#tabIn').classList.toggle('active',t==='in');$('#tabUp').classList.toggle('active',t==='up');
  $('#formIn').classList.toggle('hidden',t!=='in');$('#formUp').classList.toggle('hidden',t!=='up');
}
$('#upUser').addEventListener('input',e=>{
  const v=e.target.value,h=$('#upUserHint');
  if(!v){h.textContent='';return}
  if(!CFG.USERNAME_RE.test(v)){h.textContent='❌ Only 0-9, a-z, A-Z, ".", "_", "-" allowed';h.style.color='var(--danger)'}
  else{
    h.textContent='Checking...';h.style.color='var(--muted)';
    clearTimeout(window._unT);
    window._unT=setTimeout(async()=>{
      try{
        const free=await DB.checkUsernameFree(v);
        if($('#upUser').value!==v)return;
        h.textContent=free?'✅ Available':'❌ Already taken';h.style.color=free?'var(--ok)':'var(--danger)';
      }catch(_){h.textContent='Format looks good';h.style.color='var(--muted)';}
    },350);
  }
});
$('#formIn').onsubmit=async e=>{
  e.preventDefault();$('#inErr').textContent='';
  const b=e.submitter;if(b)b.disabled=true;
  try{await DB.login($('#inId').value.trim(),$('#inPw').value);goHome();giftPromoToast()}
  catch(err){$('#inErr').textContent=err.message}
  finally{if(b)b.disabled=false}
};
$('#formUp').onsubmit=async e=>{
  e.preventDefault();$('#upErr').textContent='';
  const u=$('#upUser').value.trim(),em=$('#upEmail').value.trim(),p=$('#upPw').value,p2=$('#upPw2').value;
  try{
    if(!CFG.USERNAME_RE.test(u))throw new Error('Username must be 1-20 chars: 0-9, a-z, A-Z, ".", "_", "-".');
    if(p.length<CFG.MIN_PW)throw new Error(`Password must be at least ${CFG.MIN_PW} characters.`);
    if(p!==p2)throw new Error('Passwords do not match.');
    const b=e.submitter;if(b)b.disabled=true;
    const user=await DB.createUser({username:u,email:em,password:p});
    // show the popup RIGHT AWAY; sign-out happens quietly in the background
    $('#formUp').reset();$('#upUserHint').textContent='';
    authTab('in');$('#inId').value=user.username;$('#inPw').value='';
    modalSignupSuccess(user,!!em);
    DB.signOut().catch(()=>{});
  }catch(err){$('#upErr').textContent=err.message}
  finally{const b=e.submitter;if(b)b.disabled=false}
};
$('#googleBtn').onclick=async()=>{
  try{
    const r=await DB.googleSignIn();
    if(r.needsProfile){show('authPage');modalPickUsername()}else{goHome();giftPromoToast()}
  }catch(err){toast(err.message,'bad')}
};
