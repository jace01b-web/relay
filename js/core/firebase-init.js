/* ==========================================================================
 * js/core/firebase-init.js
 * Firebase app/auth/database initialisation, server clock skew, mod settings listener
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

/* ---------- 2. DB layer (Firebase Realtime Database + Auth) ----------
   Reads are synchronous against a live cache kept fresh by onValue listeners.
   Writes are async and go to Firebase. Security is enforced by the database rules. */
const firebaseConfig={
  apiKey:"AIzaSyCns_X-7DF2aQawb2Q3p4YsoaQmvBMuAgM",
  authDomain:"itsuki-chat.firebaseapp.com",
  databaseURL:"https://itsuki-chat-default-rtdb.firebaseio.com",
  projectId:"itsuki-chat",
  storageBucket:"itsuki-chat.firebasestorage.app",
  messagingSenderId:"1028361304425",
  appId:"1:1028361304425:web:6c21e0fdce02c2bccce5f8"
};
const fbApp=initializeApp(firebaseConfig);
// App Check: proves requests come from THIS site (not a script / copied page). Paste your reCAPTCHA
// Enterprise site key here, then turn on "Enforce" for Realtime Database in the Firebase console.
const APPCHECK_SITE_KEY='';
if(APPCHECK_SITE_KEY){try{initializeAppCheck(fbApp,{provider:new ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY),isTokenAutoRefreshEnabled:true})}catch(e){console.warn('App Check init failed',e)}}
// initializeAuth WITHOUT a popupRedirectResolver: getAuth() silently loads a hidden Firebase auth
// iframe during startup, and in launcher windows (about:blank / blob / unauthorized domain) that
// never finishes, so onAuthStateChanged never fires and the page sits on "Connecting..." forever.
// The resolver is now only supplied when the Google popup is actually used.
const auth=initializeAuth(fbApp,{persistence:[indexedDBLocalPersistence,_bLP,browserSessionPersistence,inMemoryPersistence]});
const rtdb=getDatabase(fbApp);
const R=p=>ref(rtdb,p);
let SKEW=0;
onValue(ref(rtdb,'.info/serverTimeOffset'),s=>{SKEW=Number(s.val())||0});
onValue(R('modSettings'),s=>{MODSET={filterEnabled:true,filterNames:true,customNames:true,...(s.val()||{})};MODSET_LOADED=true;if(typeof render==='function')try{render()}catch(_){}if(typeof renderChat==='function')try{renderChat()}catch(_){}});
