/* ==========================================================================
 * js/ui/sidebar-toggle.js
 * Mobile sidebar toggle button
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
