/* ==========================================================================
 * js/core/firebase-imports.js
 * Firebase SDK functions (the SDK itself is imported once in js/loader.js and exposed as window.FB)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

const {initializeApp}=window.FB;
const {initializeAuth,indexedDBLocalPersistence,browserLocalPersistence:_bLP,browserSessionPersistence,inMemoryPersistence,browserPopupRedirectResolver,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signInWithPopup,GoogleAuthProvider,signOut:fbSignOut,sendEmailVerification,sendPasswordResetEmail,deleteUser,linkWithCredential,EmailAuthProvider,setPersistence,browserLocalPersistence}=window.FB;
const {initializeAppCheck,ReCaptchaEnterpriseProvider}=window.FB;
const {getDatabase,ref,onValue,get,set,update,remove,push,runTransaction,query,orderByChild,orderByValue,equalTo,limitToLast,limitToFirst,endAt,serverTimestamp,onDisconnect,enableLogging}=window.FB;
