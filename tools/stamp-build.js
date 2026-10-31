#!/usr/bin/env node
/* Stamps index.html with a new build label + its token. Run this EVERY time you deploy:
 *     BUILD_SECRET=<your secret> node tools/stamp-build.js            (auto-bumps the label)
 *     BUILD_SECRET=<your secret> node tools/stamp-build.js 2026-10-21.01
 * Then set MIN_BUILD (Vercel env) to that label to kill every older build instantly.
 * BUILD_SECRET must be the SAME value as the BUILD_SECRET in Vercel. Never commit it. */
const fs = require('fs'), crypto = require('crypto');
const secret = process.env.BUILD_SECRET;
if (!secret || secret.length < 16) { console.error('Set BUILD_SECRET (16+ chars), same as in Vercel.'); process.exit(1); }
const f = __dirname + '/../index.html'; let h = fs.readFileSync(f, 'utf8');
const cur = (h.match(/name="build-version" content="([^"]+)"/) || [])[1] || '';
const today = new Date().toISOString().slice(0, 10);
let label = process.argv[2];
if (!label) { const m = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/.exec(cur); label = m && m[1] === today ? today + '.' + String(+m[2] + 1).padStart(2, '0') : today + '.01'; }
if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(label)) { console.error('Label must look like 2026-10-21.01'); process.exit(1); }
const token = crypto.createHmac('sha256', secret).update('build:' + label).digest('hex').slice(0, 32);
h = h.replace(/<meta name="build-version" content="[^"]*">/, '<meta name="build-version" content="' + label + '">\n<meta name="build-token" content="' + token + '">').replace(/(<meta name="build-token" content="[^"]*">\n)<meta name="build-token" content="[^"]*">/, '$1');
fs.writeFileSync(f, h); console.log('stamped', label);
