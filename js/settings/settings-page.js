/* ==========================================================================
 * js/settings/settings-page.js
 * Settings page (Theme, Music, Pings, Moderation, ...)
 * Loaded by js/loader.js (load order lives in js/manifest.js).
 * All js files share one global scope, so functions/consts here are visible to the others.
 * ========================================================================== */
'use strict';

function openSettings(fromChat){
  ME=DB.currentUser();
  const orig={...ME.settings,pings:{...ME.settings.pings}};
  const s={...orig,pings:{...orig.pings}};
  const root=$('#modalRoot');
  root.innerHTML=`<div class="modal-bg"><div class="modal wide">
    <h2 id="sTitle">⚙️ Settings</h2>
    <div class="hint">Everything is private except your bubble &amp; text color — that's how <b>everyone</b> sees your messages.</div>

    <div class="preview-box dl-hide" id="pvBox">
      <div class="pv-bg" id="pvBg"></div><div class="pv-dim" id="pvDim"></div>
      <div class="msg"><div class="msg-row"><div class="avatar" style="width:28px;height:28px;font-size:11px">A</div><div class="msg-body"><div class="meta">Alex</div><div class="bubble" style="background:#3b3f7a;color:#fff">Hey! How does this look?</div></div></div></div>
      <div class="msg me"><div class="msg-row"><div class="avatar" style="width:28px;height:28px;font-size:11px">Y</div><div class="msg-body"><div class="meta">You</div><div class="bubble">Looking great 🔥</div></div></div></div>
    </div>

    <button type="button" class="dl-set-x" id="sX" aria-label="Close settings" title="Close (Esc)">✕</button>
    <div class="modal-tabs" id="sTabs">
      <div class="dl-set-user" id="sProfile" role="button" tabindex="0" title="Edit your profile"><span class="dl-set-av">${avatarHtml(ME,ME.username,'width:40px;height:40px;font-size:16px')}</span><span class="dl-set-nm"><b>${esc(displayUsername(ME.username))}</b><small>Edit Profiles <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="currentColor"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg></small></span></div>
      <div class="dl-set-search"><input id="sSearch" type="text" placeholder="Search" autocomplete="off" spellcheck="false" aria-label="Search settings"></div>
      <div class="dl-set-h">User Settings</div>
      <button data-t="msg" class="active"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg><i class="dl-e">💬 </i>Messages</button>
      <button data-t="bg" class="dl-hide"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg><i class="dl-e">🖼️ </i>Background</button>
      <button data-t="ui"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></svg><i class="dl-e">🎨 </i>Theme</button>
      <button data-t="ping"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg><i class="dl-e">🔔 </i>Pings</button>
      <button data-t="music"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg><i class="dl-e">🎵 </i>Music</button>
      <button data-t="filter"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/></svg><i class="dl-e">🚫 </i>Filter</button>
      <div class="dl-set-sep"></div><div class="dl-set-h">App</div>
      <button data-t="about"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg><i class="dl-e">ℹ️ </i>About</button>
      ${isStaff(ME.id)?'<div class="dl-set-sep"></div><div class="dl-set-h">Staff</div><button data-t="mod"><svg class="dl-si" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/></svg><i class="dl-e">🛡️ </i>Moderation</button>':''}
    </div>

    <div data-p="msg">
      <div class="set-card dl-hide">
        <div class="section-h" style="margin-top:0">Your message color (public)</div>
        <div class="set-grid">
          <div class="field"><label>Bubble color</label><input type="color" id="sMe" value="${s.meBubble}"></div>
          <div class="field"><label>Text color</label><input type="color" id="sMeT" value="${s.meText}"></div>
        </div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">Text display</div>
        <div class="set-grid">
          <div class="field dl-hide"><label>Bubble roundness <span class="val" id="vRad"></span></label><input type="range" id="sRad" min="0" max="28" value="${s.radius}"></div>
          <div class="field" style="grid-column:1/-1"><label>Font</label><div id="sFontChips" style="display:flex;flex-wrap:wrap;gap:6px"></div><select id="sFont" style="display:none">${fontKeys().map(f=>`<option value="${f}" ${s.font===f?'selected':''}>${f==='custom'?'custom (link)':f}</option>`).join('')}</select></div>
          <div class="field" id="sCustomFontWrap" style="grid-column:1/-1;${s.font==='custom'?'':'display:none'}"><label>Custom font link</label><input id="sCustomFont" type="url" maxlength="300" spellcheck="false" autocapitalize="off" placeholder="https://…/MyFont.woff2" value="${esc(s.customFont||'')}"><span class="hint" id="sCustomFontHint">Paste a font link, or upload a font file (.zip, .ttf, .otf, .woff, .woff2) from your device.</span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><button type="button" class="btn sec small" id="sFontUp" style="width:auto">Upload font file…</button><span class="hint" id="sFontUpName"></span></div><input type="file" id="sFontFile" accept=".zip,.ttf,.otf,.woff,.woff2" hidden></div>
          <div class="field"><label>Text size <span class="val" id="vSize"></span></label><input type="range" id="sSize" min="11" max="24" value="${s.size}"></div>
          <div class="field" style="flex-direction:row;gap:18px;align-items:center;margin-top:20px">
            <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="sBold" ${s.bold?'checked':''}> Bold</label>
            <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="sItal" ${s.italic?'checked':''}> Italic</label>
          </div>
        </div>
      </div>
    </div>

    <div data-p="bg" class="hidden">
      <div class="set-card">
        <div class="section-h" style="margin-top:0">Chat background</div>
        <div class="set-grid">
          <div class="field"><label>Type</label><select id="sBgT">${['none','color','gradient','image'].map(t=>`<option value="${t}" ${s.bgType===t?'selected':''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Image fit</label><select id="sBgFit">
            <option value="cover" ${s.bgFit!=='contain'?'selected':''}>Fill (crop to fit)</option>
            <option value="contain" ${s.bgFit==='contain'?'selected':''}>Show whole image</option></select></div>
          <div class="field"><label>Color 1</label><input type="color" id="sBg1" value="${s.bgColor}"></div>
          <div class="field"><label>Color 2 (gradient)</label><input type="color" id="sBg2" value="${s.bgColor2}"></div>
        </div>
        <div class="field" style="margin-top:14px"><label>Custom image</label>
          <label class="file-btn" id="fileLbl"><input type="file" id="sBgI" accept="image/*"><span id="fileTxt">📁 ${s.bgImage?'Change image':'Choose an image'}</span></label></div>
        <div class="set-grid" style="margin-top:4px">
          <div class="field"><label>Blur <span class="val" id="vBlur"></span></label><input type="range" id="sBlur" min="0" max="30" value="${s.bgBlur}"></div>
          <div class="field"><label>Darkness <span class="val" id="vDim"></span></label><input type="range" id="sDim" min="0" max="90" value="${s.bgDim}"></div>
        </div>
        <div class="hint">The background fills the whole app. Blur is clipped to the screen, so it never spills off the edges.</div>
      </div>
    </div>

    <div data-p="ui" class="hidden">
      <div class="set-card">
        <div class="section-h" style="margin-top:0">💬 Discord look</div>
        <div class="toggle-row" style="margin-bottom:0">
          <div>
            <div style="font-weight:600;font-size:14px">Discord look</div>
            <div class="hint" style="margin-top:2px">Off by default. Makes the whole site feel like Discord: it opens straight into your DMs, with a server-style bar on the left, a Friends page, a user panel, flat panels and plain message rows instead of chat bubbles. The main-menu ad is hidden and your custom background is covered while it's on. Saved to your account, so it follows you to every device.</div>
          </div>
          <label class="switch"><input type="checkbox" id="sDiscordLook" ${DiscordLook.on()?'checked':''}><span class="slider"></span></label>
        </div>
        <div style="margin-top:12px"><button type="button" class="btn sec small" id="sLookAsk">Choose Normal or Discord again…</button></div>
      </div>
      <div class="set-card dl-only" id="dlThemeCard">
        <div class="section-h" style="margin-top:0">🎨 Theme</div>
        <div class="dl-sub" style="margin-top:0">Default Themes</div>
        <div class="dl-themes" id="dlDefaultThemes">${DiscordLook.themes().filter(t=>t.group==='default').map(t=>`<button type="button" class="dl-sw${DiscordLook.theme()===t.id?' active':''}" data-dl-theme="${t.id}" title="${esc(t.name)}" aria-label="${esc(t.name)} theme"><span class="dl-sw-c" style="background:${t.sw}"></span><span class="dl-sw-l">${esc(t.name)}</span></button>`).join('')}</div>
        <div class="dl-sub">Color Themes</div>
        <div class="dl-themes" id="dlColorThemes">${DiscordLook.themes().filter(t=>t.group==='color').map(t=>`<button type="button" class="dl-sw${DiscordLook.theme()===t.id?' active':''}" data-dl-theme="${t.id}" title="${esc(t.name)}" aria-label="${esc(t.name)} theme"><span class="dl-sw-c" style="background:${t.sw}"></span><span class="dl-sw-l">${esc(t.name)}</span></button>`).join('')}</div>
        <div class="hint" style="margin-top:6px">Themes apply to the whole site while Discord look is on. Bubble colors, roundness, backgrounds and glass/opacity settings are hidden in Discord look. Saved to your account.</div>
      </div>
      <div class="set-card dl-hide">
        <div class="section-h" style="margin-top:0">Interface glass</div>
        <div class="field"><label>UI opacity <span class="val" id="vUiO"></span></label><input type="range" id="sUiO" min="10" max="100" value="${s.uiOpacity??50}"></div>
        <div class="field"><label>UI blur (frosted glass) <span class="val" id="vUiB"></span></label><input type="range" id="sUiB" min="0" max="30" value="${s.uiBlur??18}"></div>
        <div class="hint">Lower opacity lets your custom background show through panels, the sidebar and the top bar.</div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">Scrolling</div>
        <div class="field" style="margin-bottom:0"><label style="justify-content:flex-start;gap:8px"><input type="checkbox" id="sAutoScroll" ${s.autoScrollBottom!==false?'checked':''}> Auto-scroll to the newest message</label></div>
        <div class="hint">Jumps you to the bottom when you open a chat and whenever a new message arrives. Turn off to stay where you're reading.</div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">⚡ Performance</div>
        <div class="toggle-row" style="margin-bottom:0">
          <div>
            <div style="font-weight:600;font-size:14px">Anti-lag mode</div>
            <div class="hint" style="margin-top:2px">Off by default. Turns off the liquid-glass blur, glows, shimmer and looping effects, and makes panels more solid. Everything still works — it just draws far less. Saved to your account, so it follows you to all your devices, and it takes over from the UI opacity/blur sliders while on.</div>
          </div>
          <label class="switch"><input type="checkbox" id="sAntiLag" ${AntiLag.on()?'checked':''}><span class="slider"></span></label>
        </div>
      </div>
    </div>

    <div data-p="ping" class="hidden">
      <div class="set-card">
        <div class="section-h" style="margin-top:0">🔔 Notifications</div>
        <div class="toggle-row" style="margin-bottom:14px">
          <div style="font-weight:600;font-size:14px">Receive @everyone pings</div>
          <label class="switch"><input type="checkbox" id="sPe" ${s.pings.everyone?'checked':''}><span class="slider"></span></label>
        </div>
        <div class="toggle-row">
          <div style="font-weight:600;font-size:14px">Play sound on ping</div>
          <label class="switch"><input type="checkbox" id="sPs" ${s.pings.sound?'checked':''}><span class="slider"></span></label>
        </div>
        <div class="toggle-row" style="margin-top:14px">
          <div>
            <div style="font-weight:600;font-size:14px">Desktop notifications</div>
            <div class="hint" style="margin-top:2px">Silent notifications with the sender's name when you're pinged or DMed elsewhere.</div>
          </div>
          <label class="switch"><input type="checkbox" id="sPd" ${s.pings.desktop?'checked':''}><span class="slider"></span></label>
        </div>
      </div>
    </div>

    <div data-p="music" class="hidden">
      <div class="set-card">
        <div class="section-h" style="margin-top:0">🎵 Background music</div>
        <div class="toggle-row" style="margin-bottom:14px">
          <div>
            <div style="font-weight:600;font-size:14px">Play music while chatting</div>
            <div class="hint" style="margin-top:2px">Free music streamed from Jamendo.</div>
          </div>
          <label class="switch"><input type="checkbox" id="sMusicOn" ${s.music&&s.music.enabled?'checked':''}><span class="slider"></span></label>
        </div>
        <div class="toggle-row" style="margin-bottom:14px">
          <div>
            <div style="font-weight:600;font-size:14px">Keep playing in the background</div>
            <div class="hint" style="margin-top:2px">Off: music fades out when you switch tabs or apps, and fades back in when you return.</div>
          </div>
          <label class="switch"><input type="checkbox" id="sMusicBg" ${MusicPlayer.getBackground()?'checked':''}><span class="slider"></span></label>
        </div>
        <div class="music-search">
          <div class="ms-box">
            <svg class="ms-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input type="text" id="mQuery" placeholder="Search songs, artists or moods..." maxlength="60" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="ms-clear" id="mClear" aria-label="Clear search">✕</button>
          </div>
          <button type="button" class="btn ms-go" id="mGo"><span class="ms-spin"></span>Search</button>
        </div>
        <div class="music-chips" id="mChips"></div>
        <div id="musicWidget"></div>
        <div class="music-credit">Music via <a href="https://www.jamendo.com" target="_blank" rel="noopener">Jamendo</a></div>
      </div>
    </div>

    <div data-p="filter" class="hidden">
      <div class="set-card">
        <div class="section-h" style="margin-top:0">🚫 Content filter (your view)</div>
        <div class="toggle-row" style="margin-bottom:0">
          <div>
            <div style="font-weight:600;font-size:14px">Censor inappropriate words in chat</div>
            <div class="hint" style="margin-top:2px">On by default. This only changes what YOU see — it censors messages client-side as you read them, and doesn't affect what other people see or what's stored.</div>
          </div>
          <label class="switch"><input type="checkbox" id="sFilterLocal" ${s.filterLocal!==false?'checked':''}><span class="slider"></span></label>
        </div>
      </div>
      <div class="hint">Server-wide username filtering is controlled separately by the server owners.</div>
    </div>

    <div data-p="about" class="hidden">
      <div class="set-card">
        <div class="section-h" style="margin-top:0">ℹ️ Version</div>
        <div class="set-grid">
          <div class="field"><label>You're running</label><div style="font-weight:600;font-size:14px;padding-top:4px">${esc(MY_BUILD)||'unknown'}</div></div>
          <div class="field"><label>Server's pinned version</label><div id="aboutPinned" style="font-weight:600;font-size:14px;padding-top:4px">…</div></div>
        </div>
        <div class="hint" id="aboutHint" style="margin-top:8px"></div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">📜 Server rules</div>
        <div class="about-rules-row">
          <div class="hint" id="aboutRulesStatus" style="margin:0">${rulesAgreed(RULES_STATE)?'✅ You agreed to the rules'+(RULES_STATE.at?' on '+esc(fmtRulesDate(RULES_STATE.at)):''):'You haven\'t agreed to the rules yet.'}</div>
          <button class="btn small" id="aboutRulesBtn" type="button">📜 View rules</button>
        </div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">📄 Terms of Service</div>
        <div class="about-rules-row">
          <div class="hint" id="aboutTosStatus" style="margin:0">${TOS_GATE.accepted===true?'✅ You accepted the Terms of Service'+(TOS_STATE&&TOS_STATE.at?' on '+esc(fmtRulesDate(TOS_STATE.at)):'')+'. Chat is unlocked.':'You haven\'t accepted the Terms of Service, so chat is locked. Everything else works.'}</div>
          <button class="btn small" id="aboutTosBtn" type="button">📄 ${TOS_GATE.accepted===true?'View TOS':'Read &amp; accept'}</button>
        </div>
      </div>
    </div>

    ${isStaff(ME.id)?`<div data-p="mod" class="hidden">
      ${isOwner(ME.id)?`<div class="set-card">
        <div class="section-h" style="margin-top:0">🛡️ Content filter</div>
        <div class="toggle-row">
          <div>
            <div style="font-weight:600;font-size:14px">Filter usernames too</div>
            <div class="hint" style="margin-top:2px">Blocks filtered words at signup/rename, and censors any that slip through when shown.</div>
          </div>
          <label class="switch"><input type="checkbox" id="modFilterNames" ${filterNamesOn()?'checked':''}><span class="slider"></span></label>
        </div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">📢 Announcement</div>
        <div class="field"><label>Message</label><textarea id="modAnnText" maxlength="300" rows="3" placeholder="e.g. Server restarting in 5 minutes!" style="width:100%;resize:vertical"></textarea></div>
        <div class="set-grid" style="margin-top:10px">
          <div class="field"><label>Style</label><select id="modAnnKind">
            <option value="info">ℹ️ Info</option>
            <option value="event">🎉 Event</option>
            <option value="warn">⚠️ Warning</option>
          </select></div>
          <div class="field"><label>Also post in Announcements chat</label><select id="modAnnPost">
            <option value="1">Yes</option>
            <option value="0">No, banner only</option>
          </select></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" id="modAnnGo" type="button">Send announcement</button>
          <span class="hint" id="modAnnCount" style="align-self:center">0 / 300</span>
        </div>
        <div class="hint" style="margin-top:8px">Shows a banner for 10 seconds on every signed-in client that's open right now, and (if enabled) keeps a copy in the Announcements chat for everyone else.</div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">🎨 Custom usernames</div>
        <div class="toggle-row">
          <div>
            <div style="font-weight:600;font-size:14px">Show custom usernames with roles</div>
            <div class="hint" style="margin-top:2px">When on (default), a user's earned flair/role colors their name everywhere it's shown. When off, everyone displays as a plain username regardless of roles.</div>
          </div>
          <label class="switch"><input type="checkbox" id="modCustomNames" ${customNamesOn()?'checked':''}><span class="slider"></span></label>
        </div>
      </div>
      <div class="set-card">
        <div class="section-h" style="margin-top:0">💎 Give VIP</div>
        <div class="set-grid">
          <div class="field"><label>User ID</label><input type="number" id="modVipId" placeholder="e.g. 42"></div>
          <div class="field"><label>Duration</label><select id="modVipDur">
            <option value="24h">24 hours</option>
            <option value="perm">Forever</option>
          </select></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" id="modVipGo">Give VIP</button>
          <button class="btn sec" id="modVipRemoveGo">Remove VIP</button>
        </div>
        <div class="hint" style="margin-top:8px">Grants access to the VIP Lounge directly, without needing the daily spin. "Forever" never expires; "24 hours" counts down from now the same as a spin win.</div>
      </div>
      ${isOwner(ME.id)?`<div class="set-card">
        <div class="section-h" style="margin-top:0">👑 Give MVP</div>
        <div class="set-grid">
          <div class="field"><label>User ID</label><input type="number" id="modMvpId" placeholder="e.g. 42"></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" id="modMvpGo" type="button">Give MVP</button>
          <button class="btn sec" id="modMvpRemoveGo" type="button">Remove MVP</button>
        </div>
        <div class="hint" style="margin-top:8px">MVP is permanent until removed. It unlocks MVP Chat, longer messages, an image banner, 3 daily spins and free permanent VIP. It has no moderation powers. Owners already have every MVP perk.</div>
        <div class="section-h" style="margin-top:14px;font-size:13px">Current MVPs <span id="modMvpCount" class="hint"></span></div>
        <div id="modMvpList" style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto"></div>
      </div>`:''}
      <div class="set-card">
        <div class="section-h" style="margin-top:0">🧹 Message cleanup</div>
        <div class="field"><label>Delete messages older than</label>
          <select id="modRetention">${[[0,'Never (keep everything)'],[1,'1 day'],[3,'3 days'],[7,'7 days (default)'],[14,'14 days'],[30,'30 days']].map(([v,l])=>`<option value="${v}"${(typeof MODSET.retentionDays==='number'?MODSET.retentionDays:7)===v?' selected':''}>${l}</option>`).join('')}</select></div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" id="modPruneGo" type="button">Clean up now</button>
        </div>
        <div class="hint" id="modPruneStat" style="margin-top:8px">Runs automatically in the background too. Deletes old messages (and their reactions) in Global, VIP and any chat you're in — this shrinks your database and makes chats load faster. Announcements are never auto-deleted.</div>
      </div>`:''}
      ${(isOwner(ME.id)||isAdmin(ME.id))?`<div class="set-card">
        <div class="section-h" style="margin-top:0">🔨 Ban a user</div>
        <div class="set-grid">
          <div class="field"><label>User ID</label><input type="number" id="modBanId" placeholder="e.g. 42"></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" style="background:var(--danger)" id="modBanGo">Ban</button>
          <button class="btn sec" id="modUnbanGo">Unban</button>
        </div>
        <div class="section-h" style="margin-top:14px;font-size:13px">Currently banned <span id="modBanCount" class="hint"></span></div>
        <div id="modBanList" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto"></div>
        <div class="hint" style="margin-top:8px">${isOwner(ME.id)?'':'Admins can ban and unban anyone except owners and other admins. '}Banned accounts show as "Deleted User", reserve their old username so it can't be taken while banned, and can't send messages, change settings, or do anything else — but they stay signed in so they can't ban-evade by making a new account. Unbanning gives them a new generated username (which they can change anytime) and frees their old one for reuse.</div>
      </div>`:''}
      ${(isOwner(ME.id)||isAdmin(ME.id))?`<div class="set-card">
        <div class="section-h" style="margin-top:0">🌐 IP ban</div>
        <div class="field"><label>IP address (copy it from the Discord TOS log)</label><input id="modIpVal" type="text" maxlength="45" placeholder="e.g. 203.0.113.42" autocomplete="off" style="width:100%"></div>
        <div class="field" style="margin-top:8px"><label>Reason (optional)</label><input id="modIpWhy" type="text" maxlength="120" placeholder="e.g. raid on 10/13" autocomplete="off" style="width:100%"></div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn danger" id="modIpBan" type="button">Ban IP</button>
          <button class="btn sec" id="modIpUnban" type="button">Unban IP</button>
          <span class="hint" id="modIpMsg" style="align-self:center"></span>
        </div>
        <div class="hint" style="margin-top:8px">Banned IPs can't chat (even on new accounts). Banning an account bans its logged IP automatically. IPv6 is banned by /64 network. On a shared network (like a school) this affects everyone on it, so unban when it's over. Owners and admins can both ban and unban.</div>
      </div>`:''}
      ${isOwner(ME.id)?`<div class="set-card">
        <div class="section-h" style="margin-top:0">📄 TOS acceptances</div>
        <div class="hint">Every account that accepted the Terms, newest first, with the IP the server saw. Only owners can read this — it is not posted to Discord any more.</div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn sec small" id="tosLogGo" type="button">Load log</button>
          <span class="hint" id="tosLogMsg" style="align-self:center"></span>
        </div>
        <div id="tosLogList" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;margin-top:10px"></div>
      </div>`:''}
      ${isOwner(ME.id)?`      <div class="set-card">
        <div class="section-h" style="margin-top:0">🚀 Version control</div>
        <div class="ver-stats" id="verStats">
          <div class="ver-stat"><label>Your build</label><div class="ver-pill" id="verMyBuild">${esc(MY_BUILD)||'unknown'}</div></div>
          <div class="ver-stat"><label>Pinned version</label><div class="ver-pill" id="modVerPinned">…</div></div>
          <div class="ver-stat"><label>Latest deployed</label><div class="ver-pill" id="verLatestDeployed">checking…</div></div>
        </div>
        <div class="field" style="margin-top:14px"><label>Version to push</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="modVerInput" maxlength="60" value="${esc(MY_BUILD)}" style="flex:1">
            <button class="btn sec small" id="modVerUseLatest" type="button" style="flex-shrink:0;white-space:nowrap" disabled>Use latest deployed</button>
          </div>
        </div>
        <div class="hint bad hidden" id="modVerWarn" style="margin-top:6px"></div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" id="modVerGo">Force everyone onto this version</button>
        </div>
        <div class="hint" style="margin-top:8px">Pins this label as the site's canonical version. Every signed-in client compares its own build against it live — non-owners on a mismatched build get fully locked out of the app (can't read or do anything) until they're back on the right version, with a screen telling them to relaunch the website or join the Discord. Owners are exempt from that lock (you'll only get a small non-blocking heads-up) so you can still get in here to fix the pin even if your own tab is mismatched. Make sure the new file is actually live first: pushing a version nobody's build matches yet will leave every non-owner locked out until a matching build actually goes live.</div>
        <div class="section-h" style="margin-top:16px;font-size:13px">History</div>
        <div id="modVerHistory" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto"></div>
      </div>`:''}
      ${isOwner(ME.id)?`<div class="set-card">
        <div class="section-h" style="margin-top:0">✏️ Change a username</div>
        <div class="field"><label>Find the account (user ID or username)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="modRenQ" placeholder="e.g. 42 or their current username" autocomplete="off" spellcheck="false" style="flex:1">
            <button class="btn sec small" id="modRenFind" type="button" style="flex-shrink:0">Look up</button>
          </div>
        </div>
        <div id="modRenResults" style="margin-top:10px"></div>
        <div id="modRenForm" class="hidden" style="margin-top:12px">
          <div class="field"><label>New username (1-20 chars: 0-9 a-z A-Z . _ - and spaces)</label>
            <input type="text" id="modRenName" maxlength="20" autocomplete="off" spellcheck="false"></div>
          <div class="actions" style="justify-content:flex-start;margin-top:10px">
            <button class="btn" id="modRenGo" type="button">Change username</button>
          </div>
        </div>
        <div class="hint" style="margin-top:8px">Look the person up by ID or exact username and check it's the right account before renaming. Names set here can include spaces (normal signups and self-renames can't). Usernames can never be duplicated, and their old username is freed for anyone to use right away. They keep signing in with the same password/email — just with the new name — and the normal 7-day self-rename cooldown starts over. Banned accounts and other owners can't be renamed.</div>
      </div>`:''}
      ${isOwner(ME.id)?`<div class="set-card">
        <div class="section-h" style="margin-top:0">🎃 Halloween Pass level</div>
        <div class="field"><label>Find the account (user ID or username)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="modHwQ" placeholder="e.g. 42 or their username" autocomplete="off" spellcheck="false" style="flex:1">
            <button class="btn sec small" id="modHwFind" type="button" style="flex-shrink:0">Look up</button>
          </div>
        </div>
        <div id="modHwResults" style="margin-top:10px"></div>
        <div id="modHwForm" class="hidden" style="margin-top:12px">
          <div class="field"><label>Set pass level (0-${HW.N}, 0 removes it)</label>
            <input type="number" id="modHwLevel" min="0" max="${HW.N}" step="1" autocomplete="off"></div>
          <div class="actions" style="justify-content:flex-start;margin-top:10px">
            <button class="btn" id="modHwGo" type="button">Set level</button>
          </div>
        </div>
        <div class="hint" style="margin-top:8px">Look the person up by ID or exact username, check it's the right account, then set their level. It's pre-filled with one level above their current one. They instantly get every reward up to that level (badges, name effects, titles), and their logged-in time is raised to match when you level them up. Setting a lower level takes rewards away (their time is left alone, so they can re-claim what they've actually earned).</div>
      </div>`:''}
      <div class="set-card">
        <div class="section-h" style="margin-top:0">🔇 Mute a user</div>
        <div class="set-grid">
          <div class="field"><label>User ID</label><input type="number" id="modMuteId" placeholder="e.g. 42"></div>
          <div class="field"><label>Duration</label><select id="modMuteDur">
            ${(isOwner(ME.id)?OWNER_MUTE_OPTS:(isAdmin(ME.id)?ADMIN_MUTE_OPTS:MOD_MUTE_OPTS)).map(([m,l])=>`<option value="${m}">${l}</option>`).join('')}</select></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn" style="background:var(--danger)" id="modMuteGo">Mute</button>
          <button class="btn sec" id="modUnmuteGo">Unmute</button>
        </div>
        <div class="section-h" style="margin-top:16px;font-size:13px">Currently muted <span id="modMuteCount" class="hint"></span></div>
        <div id="modMuteList" style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto"></div>
        <div class="hint" style="margin-top:8px">${isOwner(ME.id)?'Muted users can still read messages and use menus, just can\'t send anything until the mute expires or is lifted.':isAdmin(ME.id)?'Muted users can still read messages and use menus, just can\'t send anything until the mute expires or is lifted. Admins can mute for up to 7 days, and owners and other admins can\'t be muted.':'Muted users can still read messages and use menus, just can\'t send anything until the timeout expires or is lifted. Timeouts are capped at 1 day, and owners, admins and other mods can\'t be muted.'}</div>
      </div>
      ${isStaff(ME.id)?`<div class="set-card">
        <div class="section-h" style="margin-top:0">🗑️ Delete messages</div>
        <div class="set-grid">
          <div class="field"><label>User ID</label><input type="number" id="modDelId" placeholder="e.g. 42"></div>
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:10px">
          <button class="btn sec" id="modDelSearch">Find messages</button>
        </div>
        <div class="hint" style="margin-top:8px">Shows this user's messages in Global Chat and in every room or DM <b>your own account</b> is a member of. It can't reach conversations you're not part of.${(isOwner(ME.id)||isAdmin(ME.id))?' Banning someone also wipes their messages in everything you can reach, and their own client wipes the rest of theirs.':''}${isOwner(ME.id)?'':' You can\'t delete an owner\'s messages'+(isMod(ME.id)&&!isAdmin(ME.id)?' or an admin\'s':'')+'.'}</div>
        <div id="modDelResults" style="margin-top:12px"></div>
      </div>`:''}
    </div>`:''}

    <div class="err" id="sErr"></div>
    <div class="actions">
      <button class="btn sec" id="sReset">Reset</button>
      <button class="btn sec" id="sCancel">Cancel</button>
      <button class="btn" id="sSave">Save</button>
    </div></div></div>`;
  const $$=id=>root.querySelector(id);
  let musicUnsub=null,musicTimeUnsub=null,musicMounted=false;
  let banListStop=null;   // DB.onChange unsubscribe for the Moderation > Currently banned list
  let muteListTimer=null; // 1s ticker for the Moderation > Currently muted countdowns
  function musicWidgetVolume(){
    const sl=$$('#mVol');
    return sl?+sl.value:(s.music&&s.music.volume!=null?s.music.volume:55);
  }
  function setupMusicSearch(){
    const c=$$('#mChips'),inp=$$('#mQuery'),go=$$('#mGo'),box=$$('.music-search'),clr=$$('#mClear');
    if(!c||!inp||!go)return;
    c.innerHTML=MusicPlayer.quickTags.map(t=>`<button type="button" data-tag="${t}">${t}</button>`).join('');
    inp.value=MusicPlayer.state().query.q;
    const sync=()=>box&&box.classList.toggle('has-text',!!inp.value);
    sync();
    const doSearch=()=>{
      const q=inp.value.trim();
      if(!q){const tag=MusicPlayer.state().query.tag||'lofi';MusicPlayer.load({q:'',tag});return}   // empty box: back to a genre
      MusicPlayer.load({q,tag:''});
    };
    go.onclick=doSearch;
    inp.addEventListener('input',sync);
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();doSearch()}});
    if(clr)clr.onclick=()=>{inp.value='';sync();inp.focus()};
    c.onclick=e=>{const b=e.target.closest('button[data-tag]');if(!b)return;inp.value='';sync();MusicPlayer.load({q:'',tag:b.dataset.tag})};
  }
  function syncMusicChips(st){
    const c=$$('#mChips');if(!c)return;
    c.querySelectorAll('button').forEach(b=>b.classList.toggle('on',!st.query.q&&b.dataset.tag===st.query.tag));
    const box=$$('.music-search');if(box)box.classList.toggle('busy',!!st.loading);
  }
  const fmtD=n=>{n=Math.max(0,Math.floor(n||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
  const mw={tracksRef:null,img:undefined,ps:'',curUrl:null};
  // The widget is built ONCE and then patched in place (the old version rebuilt everything on every
  // play/pause/metadata event, which reset the list scroll, reloaded thumbnails and dropped the time readout).
  function buildMusicShell(el,st){
    const setOn=on=>{const t=$$('#sMusicOn');if(t&&t.checked!==on)t.checked=on};   // keep the toggle in step with what you do here
    el.innerHTML=`
      <div class="music-now">
        <div class="music-note" id="mNote">🎵</div>
        <div class="music-meta">
          <div class="mt-name" id="mNowName"></div>
          <div class="mt-sub" id="mNowSub"></div>
        </div>
      </div>
      <div class="music-controls">
        <button id="mPrev" title="Previous">⏮</button>
        <button id="mPlay" class="mc-play" title="Play/Pause"></button>
        <button id="mNext" title="Next">⏭</button>
      </div>
      <div class="music-seek"><span id="mCur">0:00</span><input type="range" id="mSeek" min="0" max="1000" value="0"><span id="mLeft">-:--</span></div>
      <div class="field"><label>Volume <span class="val" id="vMVol">${st.volume}%</span></label>
        <input type="range" id="mVol" min="0" max="100" value="${st.volume}"></div>
      <div class="music-list" id="mList"></div>`;
    mw.tracksRef=null;mw.img=undefined;mw.ps='';mw.curUrl=null;
    $$('#mPlay').onclick=()=>{const was=MusicPlayer.state().playing;MusicPlayer.toggle();setOn(!was)};
    $$('#mPrev').onclick=()=>{setOn(true);MusicPlayer.prev()};
    $$('#mNext').onclick=()=>{setOn(true);MusicPlayer.next()};
    $$('#mVol').addEventListener('input',e=>{MusicPlayer.setVolume(+e.target.value);$$('#vMVol').textContent=e.target.value+'%'});
    const list=$$('#mList');
    list.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')return;const row=e.target.closest('.mtrack');if(row)MusicPlayer.hint(+row.dataset.i)});
    list.addEventListener('click',e=>{const row=e.target.closest('.mtrack');if(!row)return;setOn(true);MusicPlayer.playTrack(+row.dataset.i)});
    enhanceRanges(el);
    // seek bar + time readout: updated in place, so the numbers never vanish while the widget refreshes
    const seek=$$('#mSeek');let dragging=false;
    seek.addEventListener('pointerdown',()=>dragging=true);
    seek.addEventListener('pointerup',()=>dragging=false);
    seek.addEventListener('change',()=>dragging=false);
    seek.addEventListener('input',()=>{MusicPlayer.seek(seek.value/1000)});
    if(musicTimeUnsub)musicTimeUnsub();
    musicTimeUnsub=MusicPlayer.onTime(p=>{
      const c=$$('#mCur'),l=$$('#mLeft'),sk=$$('#mSeek');if(!c||!l||!sk)return;
      c.textContent=fmtD(p.current);
      l.textContent=p.duration?'-'+fmtD(p.remaining):'-:--';
      if(!dragging){sk.value=Math.round(p.fraction*1000);syncRange(sk)}
    });
  }
  function patchMusicWidget(el,st){
    const cur=st.current;
    // now-playing card
    const img=cur&&cur.image?cur.image:'';
    const note=$$('#mNote');
    if(mw.img!==img){mw.img=img;note.innerHTML=img?`<img src="${esc(img)}" alt="">`:'🎵'}
    note.classList.toggle('spin',!!(st.playing&&!img));
    $$('#mNowName').textContent=cur?cur.name:'Nothing playing';
    const sub=$$('#mNowSub');
    let subTxt,cls='mt-sub';
    if(st.loading)subTxt='Searching...';
    else if(st.lastError){subTxt=st.lastError;cls+=' err'}
    else if(st.buffering){subTxt='Loading song…';cls+=' buf'}
    else subTxt=`${cur&&cur.artist?cur.artist+' · ':''}${st.tracks.length} track${st.tracks.length===1?'':'s'} loaded`;
    sub.className=cls;sub.textContent=subTxt;
    // play button
    const ps=st.buffering?'b':st.playing?'p':'s';
    if(mw.ps!==ps){mw.ps=ps;$$('#mPlay').innerHTML=ps==='b'?'<span class="mc-spin"></span>':(ps==='p'?'⏸':'▶')}
    // track list: rebuilt only when a new search replaces it
    const list=$$('#mList');
    if(mw.tracksRef!==st.tracks){
      mw.tracksRef=st.tracks;mw.curUrl=null;
      list.innerHTML=st.tracks.map((t,i)=>`<div class="mtrack" data-i="${i}">${t.image?`<img class="mthumb" loading="lazy" src="${esc(t.image)}" alt="">`:`<span class="mi">🎵</span>`}<span class="nm">${esc(t.name)}${t.artist?`<small>${esc(t.artist)}</small>`:''}</span><span class="mdur">${t.duration?fmtD(t.duration):''}</span></div>`).join('');
    }
    const rows=list.children;
    for(let i=0;i<rows.length;i++){
      const on=!!(cur&&st.tracks[i]&&st.tracks[i].url===cur.url);
      rows[i].classList.toggle('playing',on);
      const mi=rows[i].querySelector('.mi');if(mi)mi.textContent=on&&st.playing?'▶':'🎵';
    }
    const url=cur?cur.url:null;
    if(url!==mw.curUrl){
      mw.curUrl=url;
      const row=list.querySelector('.mtrack.playing');
      if(row){const top=row.offsetTop,bot=top+row.offsetHeight;
        if(top<list.scrollTop||bot>list.scrollTop+list.clientHeight)list.scrollTo({top:Math.max(0,top-list.clientHeight/2+row.offsetHeight/2),behavior:'smooth'})}
    }
    // volume: never touch it while the user is dragging it
    const vol=$$('#mVol');
    if(vol&&document.activeElement!==vol&&!vol.matches(':active')&&+vol.value!==st.volume){
      vol.value=st.volume;syncRange(vol);$$('#vMVol').textContent=st.volume+'%';
    }
  }
  function renderMusicWidget(){
    const el=$$('#musicWidget');if(!el)return;
    const st=MusicPlayer.state();
    syncMusicChips(st);
    if(!st.ready||(st.loading&&!st.tracks.length)){
      el.innerHTML=`<div class="music-empty">🔍 Finding tracks on Jamendo...</div>`;
      if(!st.ready&&!st.loading)MusicPlayer.scan();
      return;
    }
    if(!st.tracks.length){
      const what=st.query.q?` for “${esc(st.query.q)}”`:(st.query.tag?` for “${esc(st.query.tag)}”`:'');
      el.innerHTML=`<div class="music-empty">${st.lastError?'Couldn’t load music.':'No tracks found'+what+'.<br>Try another word or pick a genre above.'}${st.lastError?`<div style="margin-top:10px;padding:8px 10px;background:rgba(255,93,115,.12);border:1px solid rgba(255,93,115,.35);border-radius:8px;font-size:11px;text-align:left;color:var(--danger);word-break:break-word">${esc(st.lastError)}</div><button type="button" class="btn sec" id="mRetry" style="margin-top:10px">Try again</button>`:''}</div>`;
      const rt=$$('#mRetry');if(rt)rt.onclick=()=>MusicPlayer.load();
      return;
    }
    if(!el.querySelector('#mList'))buildMusicShell(el,st);
    patchMusicWidget(el,st);
    MusicPlayer.emitNow&&MusicPlayer.emitNow();
  }
  $('#sTabs') && root.querySelectorAll('#sTabs button').forEach(b=>b.onclick=()=>{
    root.querySelectorAll('#sTabs button').forEach(x=>x.classList.toggle('active',x===b));
    root.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t));
    const ttl=root.querySelector('#sTitle');
    if(ttl&&typeof DiscordLook!=='undefined'&&DiscordLook.on()){const e=b.querySelector('.dl-e');ttl.textContent=b.textContent.replace(e?e.textContent:'','').trim()}
    if(b.dataset.t==='music'&&!musicMounted){
      musicMounted=true;
      setupMusicSearch();
      MusicPlayer.setVolume(s.music&&s.music.volume!=null?s.music.volume:55);
      renderMusicWidget();
      musicUnsub=MusicPlayer.on(renderMusicWidget);
    }
    if(b.dataset.t==='about')renderAboutTab();
    if(b.dataset.t==='mod'&&isOwner(ME.id)&&typeof renderVerHistory==='function')renderVerHistory();
  });
  function renderAboutTab(){
    const rb=$$('#aboutRulesBtn');
    if(rb)rb.onclick=()=>modalRules({back:()=>openSettings(true)});
    const tb=$$('#aboutTosBtn');
    if(tb)tb.onclick=()=>modalTos({back:()=>openSettings(true)});
    const pinnedEl=$$('#aboutPinned'),hintEl=$$('#aboutHint');
    if(!pinnedEl)return;
    const cur=APP_VERSION_CACHE&&APP_VERSION_CACHE.current;
    pinnedEl.textContent=cur||'not pinned yet';
    if(!cur)hintEl.textContent='';
    else if(cur===MY_BUILD)hintEl.textContent="You're up to date.";
    else hintEl.innerHTML=(isOwner(ME.id)?'Your build doesn\'t match the pinned version. You\'re an owner, so you\'re not locked out — ':'You\'re on a different version than what\'s live — ')+'you can <a href="#" id="aboutRefreshNow">refresh now</a>, or try relaunching the website, or <a href="'+OLD_VER_DISCORD+'" target="_blank" rel="noopener noreferrer">join the Discord</a>.';
    $$('#aboutRefreshNow')&&($$('#aboutRefreshNow').onclick=e=>{e.preventDefault();location.reload();});
  }
  renderAboutTab();
  let renderVerHistory=null;
  if(isOwner(ME.id)){
    let latestDeployed=undefined; // undefined = not checked yet, null = checked but couldn't tell
    const setPill=(el,text,cls)=>{if(!el)return;el.textContent=text;el.className='ver-pill'+(cls?' '+cls:'')};
    const updateWarning=()=>{
      const warn=$$('#modVerWarn'),input=$$('#modVerInput');
      if(!warn||!input)return;
      const v=input.value.trim();
      if(!v||v===MY_BUILD||(latestDeployed&&v===latestDeployed)){warn.classList.add('hidden');return}
      warn.classList.remove('hidden');
      warn.textContent='⚠️ This doesn\'t match your build or the latest detected deploy — clients (including yours) won\'t find a match until a build with that label actually goes live.';
    };
    renderVerHistory=function(){
      const pinnedEl=$$('#modVerPinned'),myEl=$$('#verMyBuild'),list=$$('#modVerHistory');
      if(!pinnedEl)return;
      const cur=APP_VERSION_CACHE&&APP_VERSION_CACHE.current;
      setPill(pinnedEl,cur||'not set',cur?(cur===MY_BUILD?'ok':'warn'):'unknown');
      setPill(myEl,MY_BUILD||'unknown',cur?(cur===MY_BUILD?'ok':'warn'):'');
      const hist=DB.versionHistory();
      list.innerHTML=hist.length?'':'<div class="hint">No version has been pushed yet.</div>';
      hist.forEach(h=>{
        const row=document.createElement('div');
        row.className='list-row';
        row.innerHTML=`<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${esc(h.version)}</div><div class="hint" style="margin-top:2px">${new Date(h.at).toLocaleString()} · by #${h.by}</div></div>`;
        list.appendChild(row);
      });
      updateWarning();
    }
    renderVerHistory();
    // Check what's actually deployed right now (independent of the DB-pinned version),
    // so the owner isn't pushing blind — see fetchDeployedBuild() near checkForUpdate().
    fetchDeployedBuild().then(v=>{
      latestDeployed=v;
      const el=$$('#verLatestDeployed'),useBtn=$$('#modVerUseLatest');
      if(el)setPill(el,v||'could not check',v?(v===MY_BUILD?'ok':'warn'):'unknown');
      if(useBtn&&v){useBtn.disabled=false;useBtn.onclick=()=>{$$('#modVerInput').value=v;updateWarning()}}
      updateWarning();
    });
    $$('#modVerInput')&&$$('#modVerInput').addEventListener('input',updateWarning);
    $$('#modVerGo')&&($$('#modVerGo').onclick=async()=>{
      const v=$$('#modVerInput').value.trim();
      if(!v){toast('Enter a version label','bad');return}
      const mismatch=v!==MY_BUILD&&!(latestDeployed&&v===latestDeployed);
      if(mismatch&&!confirm('"'+v+'" doesn\'t match your current build'+(latestDeployed?' or the latest detected deploy':'')+'. Every signed-in client (including yours) will keep retrying and reloading until a build with that exact label is actually live, then fall back to a "stuck" notice instead of looping forever. Push it anyway?'))return;
      const btn=$$('#modVerGo');btn.disabled=true;
      try{
        await DB.forceVersion(v);
        toast('Version "'+v+'" pushed — everyone will be moved onto it.');
        renderVerHistory();renderAboutTab();
      }catch(err){toast(err.message,'bad')}
      finally{btn.disabled=false}
    });
  }
  if(isStaff(ME.id)){
    $$('#modFilterNames')&&$$('#modFilterNames').addEventListener('change',e=>{
      DB.setFilterSettings({filterNames:e.target.checked}).catch(err=>toast(err.message,'bad'));
    });
    if($$('#modIpBan')){
      const go=async(action)=>{
        const ip=$$('#modIpVal').value.trim(),msg=$$('#modIpMsg');
        if(!ip){msg.textContent='Enter an IP first.';return}
        msg.textContent='Working…';
        try{await tosManualIpBan(action,ip,$$('#modIpWhy').value.trim());msg.textContent=action==='ban'?'✅ IP banned.':'✅ IP unbanned.';toast(action==='ban'?'IP banned.':'IP unbanned.')}
        catch(e){msg.textContent='❌ '+e.message}
      };
      $$('#modIpBan').onclick=()=>go('ban');
      $$('#modIpUnban').onclick=()=>go('unban');
    }
    if($$('#modAnnGo')){
      const ta=$$('#modAnnText'),cnt=$$('#modAnnCount');
      ta.addEventListener('input',()=>{cnt.textContent=ta.value.length+' / 300'});
      $$('#modAnnGo').onclick=async()=>{
        const btn=$$('#modAnnGo'),text=ta.value.trim();
        if(!text){toast('Type an announcement first.','bad');return}
        btn.disabled=true;btn.textContent='Sending…';
        try{
          const r=await DB.sendLiveAnnouncement(text,{kind:$$('#modAnnKind').value,alsoPost:$$('#modAnnPost').value==='1'});
          toast(r.live?'Announcement sent'+(r.posted?' and posted to the Announcements chat.':'.'):'Posted to the Announcements chat (live banner was blocked by the database rules).');
          ta.value='';cnt.textContent='0 / 300';
        }catch(err){toast(err.message,'bad')}
        finally{btn.disabled=false;btn.textContent='Send announcement'}
      };
    }
    $$('#modCustomNames')&&$$('#modCustomNames').addEventListener('change',e=>{
      DB.setFilterSettings({customNames:e.target.checked}).catch(err=>{toast(err.message,'bad');e.target.checked=!e.target.checked});
    });
    $$('#modVipGo')&&($$('#modVipGo').onclick=async()=>{
      const id=+$$('#modVipId').value,dur=$$('#modVipDur').value;
      if(!id){toast('Enter a user ID','bad');return}
      try{await DB.giveVip(id,dur);toast('User #'+id+' given VIP ('+(dur==='perm'?'forever':'24 hours')+').')}
      catch(err){toast(err.message,'bad')}
    });
    $$('#modVipRemoveGo')&&($$('#modVipRemoveGo').onclick=async()=>{
      const id=+$$('#modVipId').value;
      if(!id){toast('Enter a user ID','bad');return}
      try{await DB.removeVip(id);toast('VIP removed from user #'+id+'.')}
      catch(err){toast(err.message,'bad')}
    });
    if($$('#modMvpGo')){
      const renderMvpList=()=>{
        const box=$$('#modMvpList'),cnt=$$('#modMvpCount');if(!box)return;
        const ids=DB.mvpIds().sort((a,b)=>a-b);
        if(cnt)cnt.textContent=ids.length?'('+ids.length+')':'';
        box.innerHTML=ids.length?ids.map(id=>{const u=DB.getUser(id);const nm=(u&&!u.deleted)?displayUsername(u.username):'User';
          return`<div class="list-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px"><span>👑 <b>${esc(nm)}</b> <span class="hint">#${id}</span></span><button class="btn sec small" type="button" data-mvp-rm="${id}">Remove</button></div>`}).join(''):'<div class="hint">Nobody is an MVP yet.</div>';
        box.querySelectorAll('[data-mvp-rm]').forEach(b=>b.onclick=async()=>{
          const id=+b.dataset.mvpRm;if(!confirm('Remove MVP from user #'+id+'?'))return;
          b.disabled=true;
          try{await DB.removeMvp(id);toast('MVP removed from user #'+id+'.');setTimeout(renderMvpList,250)}
          catch(err){toast(err.message,'bad');b.disabled=false}
        });
      };
      renderMvpList();
      $$('#modMvpGo').onclick=async()=>{
        const id=+$$('#modMvpId').value;
        if(!id){toast('Enter a user ID','bad');return}
        try{await DB.giveMvp(id);toast('User #'+id+' is now an MVP.');setTimeout(renderMvpList,250)}
        catch(err){toast(err.message,'bad')}
      };
      $$('#modMvpRemoveGo').onclick=async()=>{
        const id=+$$('#modMvpId').value;
        if(!id){toast('Enter a user ID','bad');return}
        try{await DB.removeMvp(id);toast('MVP removed from user #'+id+'.');setTimeout(renderMvpList,250)}
        catch(err){toast(err.message,'bad')}
      };
    }
    /* Live list of everyone currently banned, with a one-click Unban on each row. banned/ is
       readable by any signed-in account, so this needs no extra rule. An admin can't act on an
       owner or another admin, so those rows show the reason instead of a button. */
    const renderBanList=()=>{
      const box=$$('#modBanList'),cnt=$$('#modBanCount');if(!box)return;
      const ids=DB.bannedIds().sort((a,b)=>a-b);
      if(cnt)cnt.textContent=ids.length?'('+ids.length+')':'';
      if(!ids.length){box.innerHTML='<div class="hint">Nobody is banned right now.</div>';return}
      const iAmOwner=isOwner(ME.id);
      box.innerHTML=ids.map(id=>{
        const u=DB.getUser(id);
        const nm=(u&&!u.deleted&&u.username)?displayUsername(u.username):'Deleted User';
        const locked=!iAmOwner&&(isOwner(id)||isAdmin(id));
        return '<div class="list-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px">'+
          '<span>\u{1F528} <b>'+esc(nm)+'</b> <span class="hint">#'+id+'</span></span>'+
          (locked?'<span class="hint">owner / admin</span>'
                 :'<button class="btn sec small" data-unban="'+id+'" type="button">Unban</button>')+
          '</div>';
      }).join('');
      box.querySelectorAll('[data-unban]').forEach(b=>b.onclick=async()=>{
        const id=+b.dataset.unban;
        b.disabled=true;b.textContent='Unbanning\u2026';
        try{
          const newName=await DB.unbanUser(id);
          toast(newName?('User #'+id+' unbanned \u2014 back as @'+newName+'.')
                       :('User #'+id+' unbanned. Their profile comes back the next time they sign in.'));
          setTimeout(renderBanList,250);
        }catch(err){toast(err.message,'bad');b.disabled=false;b.textContent='Unban'}
      });
    };
    renderBanList();
    if($$('#modBanList'))banListStop=DB.onChange(()=>{try{renderBanList()}catch(_){}});
    /* Same idea for mutes: who is muted right now, how long is left, and one click to lift it.
       Unmuting is already open to mods, admins and owners, so every staff member sees this. */
    const renderMuteList=()=>{
      const box=$$('#modMuteList'),cnt=$$('#modMuteCount');if(!box)return;
      const ids=DB.mutedIds();
      if(cnt)cnt.textContent=ids.length?'('+ids.length+')':'';
      if(!ids.length){box.innerHTML='<div class="hint">Nobody is muted right now.</div>';return}
      box.innerHTML=ids.map(id=>{
        const u=DB.getUser(id);
        const nm=(u&&!u.deleted&&u.username)?displayUsername(u.username):'User';
        let left='';try{left=fmtMuteRemaining(DB.muteRemainingMs(id))}catch(_){}
        return '<div class="list-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px">'+
          '<span>\u{1F507} <b>'+esc(nm)+'</b> <span class="hint">#'+id+(left?' \u00B7 '+esc(left)+' left':'')+'</span></span>'+
          '<button class="btn sec small" data-unmute="'+id+'" type="button">Unmute</button></div>';
      }).join('');
      box.querySelectorAll('[data-unmute]').forEach(b=>b.onclick=async()=>{
        const id=+b.dataset.unmute;b.disabled=true;
        try{await DB.unmuteUser(id);toast('User #'+id+' unmuted.');setTimeout(renderMuteList,250)}
        catch(err){toast(err.message,'bad');b.disabled=false}
      });
    };
    renderMuteList();
    if($$('#modMuteList'))muteListTimer=setInterval(renderMuteList,1000);   // the countdowns tick
    /* TOS acceptance log. Fetched on demand (owners only — the rules deny everyone else), and the
       raw IP is shown with a copy button plus a one-click jump to the IP-ban field above it. */
    $$('#tosLogGo')&&($$('#tosLogGo').onclick=async()=>{
      const btn=$$('#tosLogGo'),msg=$$('#tosLogMsg'),box=$$('#tosLogList');
      btn.disabled=true;btn.textContent='Loading\u2026';if(msg)msg.textContent='';
      try{
        const rows=await DB.tosLog();
        btn.textContent='Refresh';
        if(msg)msg.textContent=rows.length?(rows.length+' account'+(rows.length===1?'':'s')):'';
        if(!rows.length){box.innerHTML='<div class="hint">Nothing yet. Records appear as people accept the new Terms.</div>';return}
        box.innerHTML=rows.map(r=>{
          const when=r.at?new Date(Number(r.at)).toLocaleString():'-';
          return '<div class="list-row" style="display:block;padding:8px 10px">'+
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
              '<b>'+esc(r.name||'(unknown)')+'</b><span class="hint">#'+r.id+'</span>'+
              '<code style="font-size:12px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.07)">'+esc(r.ip||'-')+'</code>'+
              '<button class="btn sec small" data-tos-copy="'+esc(r.ip||'')+'" type="button">Copy IP</button>'+
              '<button class="btn sec small" data-tos-ban="'+esc(r.ip||'')+'" type="button">Use in IP ban</button>'+
            '</div>'+
            '<div class="hint" style="margin-top:4px">'+esc(when)+' \u00B7 TOS v'+esc(String(r.v||'?'))+
              ' \u00B7 VPN: '+esc(r.vpn||'?')+(r.build?' \u00B7 build '+esc(r.build):'')+'</div>'+
            (r.ua?'<div class="hint" style="margin-top:2px;word-break:break-word;opacity:.75">'+esc(r.ua)+'</div>':'')+
          '</div>';
        }).join('');
        box.querySelectorAll('[data-tos-copy]').forEach(b=>b.onclick=()=>{
          const ip=b.dataset.tosCopy;if(!ip)return;
          try{navigator.clipboard.writeText(ip)}catch(_){}
          b.textContent='Copied';setTimeout(()=>{b.textContent='Copy IP'},1400);
        });
        box.querySelectorAll('[data-tos-ban]').forEach(b=>b.onclick=()=>{
          const f=$$('#modIpVal');if(!f||!b.dataset.tosBan)return;
          f.value=b.dataset.tosBan;f.scrollIntoView({block:'center'});f.focus();
        });
      }catch(e){
        btn.textContent='Load log';
        if(msg)msg.textContent=(e&&e.message)||'Could not read it.';
      }finally{btn.disabled=false}
    });
    $$('#modBanGo')&&($$('#modBanGo').onclick=async()=>{
      const id=+$$('#modBanId').value;
      if(!id){toast('Enter a user ID','bad');return}
      try{await DB.banUser(id);toast('User #'+id+' banned.');setTimeout(renderBanList,250)}catch(err){toast(err.message,'bad')}
    });
    $$('#modUnbanGo')&&($$('#modUnbanGo').onclick=async()=>{
      const id=+$$('#modBanId').value;
      if(!id){toast('Enter a user ID','bad');return}
      try{
        const newName=await DB.unbanUser(id);
        toast(newName?('User #'+id+' unbanned — back as @'+newName+'.')
                     :('User #'+id+' unbanned. Their profile comes back the next time they sign in.'));
      }catch(err){toast(err.message,'bad')}
    });
    $$('#modRetention')&&($$('#modRetention').onchange=async e=>{
      try{await DB.setRetention(+e.target.value);toast(+e.target.value?'Messages older than '+e.target.value+' day(s) will be cleaned up.':'Automatic cleanup is off.')}
      catch(err){toast(err.message,'bad')}
    });
    $$('#modPruneGo')&&($$('#modPruneGo').onclick=async()=>{
      const btn=$$('#modPruneGo'),st=$$('#modPruneStat');
      if(!DB.retentionDays()){toast('Pick an age above first (cleanup is set to Never).','bad');return}
      btn.disabled=true;btn.textContent='Cleaning…';
      const r=await DB.pruneRun({aggressive:true,maxBatches:400,onProgress:n=>{if(st)st.textContent='Deleted '+n+' old message(s) so far…'}});
      btn.disabled=false;btn.textContent='Clean up now';
      if(st)st.textContent=r.busy?'Another cleanup is already running — try again in a moment.':'Done. Deleted '+r.deleted+' old message(s).';
    });
    $$('#modMuteGo')&&($$('#modMuteGo').onclick=async()=>{
      const id=+$$('#modMuteId').value;
      if(!id){toast('Enter a user ID','bad');return}
      const mins=+$$('#modMuteDur').value;
      try{await DB.muteUser(id,mins*60*1000);toast('User #'+id+' muted for '+$$('#modMuteDur').selectedOptions[0].textContent+'.')}catch(err){toast(err.message,'bad')}
    });
    $$('#modUnmuteGo')&&($$('#modUnmuteGo').onclick=async()=>{
      const id=+$$('#modMuteId').value;
      if(!id){toast('Enter a user ID','bad');return}
      try{await DB.unmuteUser(id);toast('User #'+id+' unmuted.')}catch(err){toast(err.message,'bad')}
    });
    if($$('#modRenFind')){
      let renTarget=null;
      const resBox=$$('#modRenResults'),form=$$('#modRenForm'),nameIn=$$('#modRenName'),qIn=$$('#modRenQ');
      const pick=m=>{
        renTarget=m;
        const cls=m=>[m.owner?'owner':'',m.banned?'banned':'',m.deleted?'deleted':''].filter(Boolean).join(', ');
        resBox.innerHTML=`<div class="list-row" style="align-items:center">${avatarHtml(m.user,m.username)}<div style="flex:1;min-width:0;margin-left:10px"><div class="nm" style="word-break:break-word">${esc(m.username)} <span class="hint">#${m.id}</span></div>${cls(m)?`<div class="hint">${cls(m)}</div>`:''}</div></div>`;
        if(m.banned||m.deleted){form.classList.add('hidden');resBox.insertAdjacentHTML('beforeend','<div class="hint bad" style="margin-top:6px">Banned/deleted accounts can\'t be renamed. Unban them first.</div>');return}
        if(m.owner&&m.id!==ME.id){form.classList.add('hidden');resBox.insertAdjacentHTML('beforeend','<div class="hint bad" style="margin-top:6px">You can\'t rename another owner.</div>');return}
        form.classList.remove('hidden');nameIn.value=m.username;nameIn.focus();nameIn.select();
      };
      const find=async()=>{
        renTarget=null;form.classList.add('hidden');
        resBox.innerHTML='<div class="hint">Searching…</div>';
        let found;
        try{found=await DB.lookupUserForRename(qIn.value)}
        catch(err){resBox.innerHTML=`<div class="hint" style="color:var(--danger)">${esc(err.message||'Lookup failed')}</div>`;return}
        if(!found.length){resBox.innerHTML='<div class="empty">No account found with that ID or username.</div>';return}
        if(found.length===1){pick(found[0]);return}
        // a number can be one person's ID and another person's username — let the owner choose
        resBox.innerHTML='<div class="hint" style="margin-bottom:6px">Two accounts match — pick the right one:</div>';
        found.forEach(m=>{
          const row=document.createElement('div');row.className='list-row';row.style.cursor='pointer';
          row.innerHTML=`${avatarHtml(m.user,m.username)}<div style="flex:1;min-width:0;margin-left:10px"><div class="nm">${esc(m.username)} <span class="hint">#${m.id}</span></div></div><button class="btn small" type="button">Select</button>`;
          row.querySelector('button').onclick=()=>pick(m);
          resBox.appendChild(row);
        });
      };
      $$('#modRenFind').onclick=find;
      qIn.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find()}});
      nameIn.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$$('#modRenGo').click()}});
      $$('#modRenGo').onclick=async()=>{
        if(!renTarget){toast('Look up an account first.','bad');return}
        const target=renTarget,wanted=nameIn.value;
        if(!confirm('Change "'+target.username+'" (#'+target.id+') to "'+wanted.replace(/\s+/g,' ').trim()+'"?\n\nTheir old username becomes available to anyone.'))return;
        const btn=$$('#modRenGo');btn.disabled=true;btn.textContent='Changing…';
        try{
          const r=await DB.ownerRenameUser(target.id,wanted);
          toast('#'+r.id+' renamed: "'+r.oldName+'" → "'+r.newName+'". The old name is now free.');
          qIn.value='';nameIn.value='';form.classList.add('hidden');renTarget=null;
          resBox.innerHTML=`<div class="hint">Done — #${r.id} is now <b>${esc(r.newName)}</b>. "${esc(r.oldName)}" is available again.</div>`;
        }catch(err){toast(err.message,'bad')}
        finally{btn.disabled=false;btn.textContent='Change username'}
      };
    }
    if($$('#modHwFind')){
      let hwTarget=null;
      const resBox=$$('#modHwResults'),form=$$('#modHwForm'),lvIn=$$('#modHwLevel'),qIn=$$('#modHwQ');
      const pick=m=>{
        hwTarget=m;
        const L=hwLevel(m.id);
        const cls=[m.owner?'owner':'',m.banned?'banned':'',m.deleted?'deleted':''].filter(Boolean).join(', ');
        resBox.innerHTML=`<div class="list-row" style="align-items:center">${avatarHtml(m.user,m.username)}<div style="flex:1;min-width:0;margin-left:10px"><div class="nm" style="word-break:break-word">${esc(m.username)} <span class="hint">#${m.id}</span></div>${cls?`<div class="hint">${cls}</div>`:''}<div class="hint">🎃 Pass level ${L} / ${HW.N}${L?' · '+esc(HW_R[L-1][0]+' '+HW_R[L-1][1]):''}</div></div></div>`;
        if(m.deleted){form.classList.add('hidden');resBox.insertAdjacentHTML('beforeend','<div class="hint bad" style="margin-top:6px">Deleted accounts can\'t be given pass levels.</div>');return}
        form.classList.remove('hidden');lvIn.value=Math.min(HW.N,L+1);
      };
      const find=async()=>{
        hwTarget=null;form.classList.add('hidden');
        resBox.innerHTML='<div class="hint">Searching…</div>';
        let found;
        try{found=await DB.lookupUserForRename(qIn.value)}
        catch(err){resBox.innerHTML=`<div class="hint" style="color:var(--danger)">${esc(err.message||'Lookup failed')}</div>`;return}
        if(!found.length){resBox.innerHTML='<div class="empty">No account found with that ID or username.</div>';return}
        if(found.length===1){pick(found[0]);return}
        resBox.innerHTML='<div class="hint" style="margin-bottom:6px">Two accounts match — pick the right one:</div>';
        found.forEach(m=>{
          const row=document.createElement('div');row.className='list-row';row.style.cursor='pointer';
          row.innerHTML=`${avatarHtml(m.user,m.username)}<div style="flex:1;min-width:0;margin-left:10px"><div class="nm">${esc(m.username)} <span class="hint">#${m.id}</span></div></div><button class="btn small" type="button">Select</button>`;
          row.querySelector('button').onclick=()=>pick(m);
          resBox.appendChild(row);
        });
      };
      $$('#modHwFind').onclick=find;
      qIn.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find()}});
      lvIn.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$$('#modHwGo').click()}});
      $$('#modHwGo').onclick=async()=>{
        if(!hwTarget){toast('Look up an account first.','bad');return}
        const t=hwTarget,lv=Math.floor(Number(lvIn.value)),cur=hwLevel(t.id);
        if(!Number.isFinite(lv)||lv<0||lv>HW.N){toast('Level must be between 0 and '+HW.N+'.','bad');return}
        if(lv===cur){toast(t.username+' is already level '+cur+'.','bad');return}
        if(!confirm((lv>cur?'Level up':'Lower')+' "'+t.username+'" (#'+t.id+') on the Halloween Pass from level '+cur+' to level '+lv+'?'))return;
        const btn=$$('#modHwGo');btn.disabled=true;btn.textContent='Saving…';
        try{
          const r=await DB.ownerSetHalloweenLevel(t.id,lv);
          toast('🎃 '+r.username+' (#'+r.id+') is now Halloween Pass level '+r.level+'.');
          pick(t);
        }catch(err){toast(err.message,'bad')}
        finally{btn.disabled=false;btn.textContent='Set level'}
      };
    }
    $$('#modDelSearch')&&($$('#modDelSearch').onclick=async()=>{
      const id=+$$('#modDelId').value;
      const resBox=$$('#modDelResults');
      if(!id){toast('Enter a user ID','bad');return}
      resBox.innerHTML='<div class="hint">Searching…</div>';
      let results;
      try{results=await DB.searchUserMessages(id)}
      catch(err){resBox.innerHTML=`<div class="hint" style="color:var(--danger)">Search failed: ${esc(err.message||err.code||'')}</div>`;return}
      renderModDelResults(resBox,id,results);
    });
  }
  function keyLabel(key){
    if(key===CFG.GLOBAL_ROOM)return '🌍 Global Chat';
    if(key===CFG.ANNOUNCEMENTS_ROOM)return '📢 Announcements';
    if(key===CFG.SHITPOST_ROOM)return '💩 Shitpost';
    if(key===CFG.VIP_ROOM)return '💎 VIP Lounge';
    if(key===CFG.MVP_ROOM)return '🏆 MVP Lounge';
    if(key.startsWith('dm_')){
      const [,a,b]=key.split('_').map(Number);const other=a===ME.id?b:a;
      const u=DB.getUser(other);
      return '💬 DM with '+(u?esc(u.username):'#'+other);
    }
    const r=DB.getRoom(key);
    return r?('🔒 '+esc(r.name)):('🔒 Room '+key);
  }
  function renderModDelResults(resBox,userId,results){
    if(!results.length){resBox.innerHTML='<div class="hint">No messages found for #'+userId+' in any conversation you can see.</div>';return}
    resBox.innerHTML=`<div class="hint" style="margin-bottom:8px">${results.length} message${results.length===1?'':'s'} found.</div>
      <div class="actions" style="justify-content:flex-start;margin-bottom:10px">
        <button class="btn" style="background:var(--danger)" id="modDelAll">Delete all ${results.length}</button>
      </div>
      <div id="modDelList" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto"></div>`;
    const list=resBox.querySelector('#modDelList');
    results.forEach(r=>{
      const row=document.createElement('div');
      row.className='list-row';row.style.alignItems='flex-start';
      const when=new Date(r.at).toLocaleString();
      const preview=r.text?esc(r.text).slice(0,140):(r.images.length?'📷 '+r.images.length+' image'+(r.images.length===1?'':'s'):((r.files&&r.files.length)?esc(filesLabel(r.files)):'(empty)'));
      row.innerHTML=`<div style="flex:1;min-width:0">
          <div class="hint" style="margin-bottom:3px">${keyLabel(r.key)} · ${when}</div>
          <div style="font-size:13px;word-break:break-word">${preview}</div>
        </div>
        <button class="btn danger small" data-del-one="${r.key}|${r.id}">Delete</button>`;
      list.appendChild(row);
    });
    resBox.querySelectorAll('[data-del-one]').forEach(b=>{
      b.onclick=async()=>{
        const [key,mid]=b.dataset.delOne.split('|');
        b.disabled=true;
        try{
          await DB.deleteMessage(key,mid);
          toast('Message deleted.');
          renderModDelResults(resBox,userId,results.filter(r=>!(r.key===key&&r.id===mid)));
        }catch(err){toast(err.message,'bad');b.disabled=false}
      };
    });
    const allBtn=resBox.querySelector('#modDelAll');
    if(allBtn)allBtn.onclick=async()=>{
      if(!confirm('Delete all '+results.length+' message(s) from #'+userId+'? This removes them for everyone and cannot be undone.'))return;
      allBtn.disabled=true;allBtn.textContent='Deleting…';
      let ok=0,fail=0;
      try{const res=await DB.deleteMessagesBulk(results.map(r=>({key:r.key,id:r.id})));ok=res.ok;fail=res.fail}
      catch(e){fail=results.length}
      toast(fail?`Deleted ${ok}, ${fail} failed.`:`Deleted ${ok} message(s).`,fail?'bad':undefined);
      renderModDelResults(resBox,userId,[]);
    };
  }
  function read(){
    s.meBubble=$$('#sMe').value;s.meText=$$('#sMeT').value;
    s.radius=+$$('#sRad').value;s.font=$$('#sFont').value;s.size=+$$('#sSize').value;
    s.customFont=(($$('#sCustomFont')||{}).value||'').trim();
    s.bold=$$('#sBold').checked;s.italic=$$('#sItal').checked;
    s.bgType=$$('#sBgT').value;s.bgColor=$$('#sBg1').value;s.bgColor2=$$('#sBg2').value;
    s.bgFit=$$('#sBgFit').value;
    s.bgBlur=+$$('#sBlur').value;s.bgDim=+$$('#sDim').value;
    s.uiOpacity=+$$('#sUiO').value;s.uiBlur=+$$('#sUiB').value;
    s.autoScrollBottom=$$('#sAutoScroll').checked;
    s.discordLook=DiscordLook.on();
    s.antiLag=AntiLag.on();   // keep the Save payload in step with the toggle (it saves itself instantly)
    s.filterLocal=$$('#sFilterLocal').checked;
    s.pings={everyone:$$('#sPe').checked,sound:$$('#sPs').checked,desktop:$$('#sPd').checked};
    s.music={enabled:$$('#sMusicOn').checked,volume:musicWidgetVolume(),shuffle:s.music&&s.music.shuffle!==false};
  }
  $$('#sFontUp').onclick=()=>$$('#sFontFile').click();
  $$('#sFontFile').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    const nm=$$('#sFontUpName');nm.textContent='Reading…';
    try{
      const r=await readFontFile(f);
      s.customFontData=r.dataUrl;s.customFontFile=r.name;
      $$('#sCustomFont').value='';
      pickFont('custom');
      nm.textContent='Uploaded: '+r.name+(r.count>1?' (picked 1 of '+r.count+' fonts in the zip)':'');
    }catch(err){nm.textContent=(err&&err.message)||'Could not read that file.'}
  };
  function pickFont(k){const f=$$('#sFont');f.value=k;f.dispatchEvent(new Event('input',{bubbles:true}))}
  function renderFontChips(){
    const box=$$('#sFontChips');if(!box)return;
    const saved=savedFonts(s.customFonts);
    const mk=(label,on,fn,fam)=>{
      const b=document.createElement('button');
      b.type='button';b.className=on?'btn small':'btn sec small';b.textContent=label;b.style.width='auto';
      if(fam)b.style.fontFamily=fam;
      b.onclick=fn;return b;
    };
    box.textContent='';
    Object.keys(FONTS).filter(k=>k!=='custom').forEach(k=>box.appendChild(mk(k,s.font===k,()=>pickFont(k),typeof FONTS[k]==='string'?FONTS[k]:''))); 
    saved.forEach(u=>{
      const w=document.createElement('span');w.style.cssText='display:inline-flex;gap:2px';
      w.appendChild(mk(fontLabel(u),s.font==='custom'&&s.customFont===u,()=>{$$('#sCustomFont').value=u;pickFont('custom')}));
      const x=mk('✕',false,()=>{s.customFonts=saved.filter(v=>v!==u).join('\n');renderFontChips()});
      x.title='Remove from saved fonts';x.setAttribute('aria-label','Remove '+fontLabel(u));
      w.appendChild(x);box.appendChild(w);
    });
    if(s.customFontData){
      const w=document.createElement('span');w.style.cssText='display:inline-flex;gap:2px';
      const lab='uploaded: '+String(s.customFontFile||'font').replace(/\.(ttf|otf|woff2?)$/i,'').slice(0,18);
      w.appendChild(mk(lab,s.font==='custom'&&!s.customFont,()=>{$$('#sCustomFont').value='';pickFont('custom')}));
      const x=mk('✕',false,()=>{s.customFontData='';s.customFontFile='';if(s.font==='custom'&&!s.customFont)pickFont('system');else renderFontChips()});
      x.title='Remove the uploaded font';w.appendChild(x);box.appendChild(w);
    }
    box.appendChild(mk('＋ custom font',s.font==='custom'&&(s.customFont?!saved.includes(s.customFont):!s.customFontData),()=>{pickFont('custom');const i=$$('#sCustomFont');if(i)i.focus()}));
    const nm=$$('#sFontUpName');if(nm)nm.textContent=s.customFontData?'Uploaded: '+(s.customFontFile||'font'):'';
  }
  // Remember a custom font link the user saved with, so it shows up as a button next time (any device).
  function rememberFont(){
    if(s.font!=='custom'||!CustomFont.valid(s.customFont))return;
    const l=savedFonts(s.customFonts).filter(x=>x!==s.customFont);
    l.unshift(s.customFont);
    while(l.length>5||l.join('\n').length>1500)l.pop();
    s.customFonts=l.join('\n');
  }
  function readouts(){
    $$('#vRad').textContent=s.radius+'px';$$('#vSize').textContent=s.size+'px';
    $$('#vBlur').textContent=s.bgBlur+'px';$$('#vDim').textContent=s.bgDim+'%';
    $$('#vUiO').textContent=s.uiOpacity+'%';$$('#vUiB').textContent=s.uiBlur+'px';
  }
  function preview(){
    read();readouts();
    $$('#sCustomFontWrap').style.display=s.font==='custom'?'':'none';
    renderFontChips();
    applyStyle($$('#pvBox'),s);
    paintBg($$('#pvBg'),$$('#pvDim'),s);
    // live-preview the real app too, so background/glass changes are visible behind the modal
    applyStyle(document.documentElement,s);
    refitAllAvatars();
  }
  $$('#sMusicOn').addEventListener('change',()=>{
    preview();
    if(s.music.enabled)MusicPlayer.play();else MusicPlayer.pause();
  });
  // Background play is a per-device choice kept in localStorage (no database field / rule change needed).
  $$('#sMusicBg').addEventListener('change',e=>MusicPlayer.setBackground(e.target.checked));
  // Anti-lag is an account setting (synced across devices); applied instantly and saved straight away.
  $$('#sAntiLag').addEventListener('change',e=>AntiLag.set(e.target.checked));
  $$('#sDiscordLook').addEventListener('change',e=>DiscordLook.set(e.target.checked));
  $$('#sLookAsk')&&($$('#sLookAsk').onclick=()=>DiscordLook.ask());
  $$('#dlThemeCard')&&$$('#dlThemeCard').addEventListener('click',e=>{
    const b=e.target.closest('[data-dl-theme]');if(!b)return;
    DiscordLook.setTheme(b.dataset.dlTheme);
    $$('#dlThemeCard').querySelectorAll('[data-dl-theme]').forEach(x=>x.classList.toggle('active',x===b));
    const nm=$$('#dlThemeName');if(nm)nm.textContent=b.title;
  });
  // Flipping this on has to ask the browser for permission right here, inside the click
  // handler — browsers require a real user gesture for the prompt to reliably show at all,
  // and this is the ONLY place in the app permission is ever requested (see the notes above
  // checkPingNotifications). Turning it off never touches browser permission at all.
  $$('#sPd').addEventListener('change',e=>{
    if(!e.target.checked)return;                 // turning off: just a preference change
    if(typeof Notification==='undefined'){e.target.checked=false;preview();toast('Your browser does not support notifications.','bad');return}
    if(Notification.permission==='granted')return;        // already have it — nothing to ask
    if(Notification.permission==='denied'){                // previously blocked — auto turn back off
      e.target.checked=false;preview();
      toast('Notifications are blocked for this site in your browser settings.','bad');
      return;
    }
    // permission is 'default' — genuinely ask; auto-revert the toggle if they decline
    Notification.requestPermission().then(p=>{
      if(p!=='granted'){e.target.checked=false;preview();toast('Notifications were not allowed.','bad')}
    });
  });
  root.querySelectorAll('input,select').forEach(i=>i.addEventListener('input',preview));
  $$('#sBgI').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    $$('#fileTxt').textContent='⏳ Processing...';
    try{
      s.bgImage=await compressImage(f,1920,.8);
      s.bgType='image';$$('#sBgT').value='image';
      $$('#fileTxt').textContent='✅ '+f.name;
    }catch(_){$$('#fileTxt').textContent='❌ Could not load that image'}
    preview();
  };
  const closeRevert=()=>{if(musicUnsub)musicUnsub();if(musicTimeUnsub)musicTimeUnsub();if(banListStop){banListStop();banListStop=null}if(muteListTimer){clearInterval(muteListTimer);muteListTimer=null}closeModalAnimated(root,()=>{applyStyle(document.documentElement,ME.settings);refitAllAvatars();MusicPlayer.applyPrefs(ME.settings.music)})};
  $$('#sCancel').onclick=closeRevert;
  $$('#sX').onclick=closeRevert;
  // Discord look: the profile card at the top of the nav opens your account/profile (settings are reverted first, like Cancel)
  const goAccount=()=>{if(musicUnsub)musicUnsub();if(musicTimeUnsub)musicTimeUnsub();if(banListStop){banListStop();banListStop=null}if(muteListTimer){clearInterval(muteListTimer);muteListTimer=null}closeModalAnimated(root,()=>{applyStyle(document.documentElement,ME.settings);refitAllAvatars();MusicPlayer.applyPrefs(ME.settings.music);openAccount()})};
  const t0=root.querySelector('#sTitle');if(t0&&typeof DiscordLook!=='undefined'&&DiscordLook.on())t0.textContent='Messages';
  const prof=root.querySelector('#sProfile');
  if(prof){prof.onclick=goAccount;prof.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goAccount()}}}
  const srch=root.querySelector('#sSearch');
  if(srch)srch.addEventListener('input',()=>{
    const q=srch.value.trim().toLowerCase();
    root.querySelectorAll('#sTabs button[data-t]').forEach(b=>{b.style.display=(!q||b.textContent.toLowerCase().includes(q))?'':'none'});
    root.querySelectorAll('#sTabs .dl-set-h,#sTabs .dl-set-sep').forEach(h=>{h.style.display=q?'none':''});
  });
  $$('#sReset').onclick=()=>{
    Object.assign(s,{meBubble:'#7c6cff',meText:'#ffffff',radius:16,font:'system',customFont:'',size:15,bold:false,italic:false,bgType:'gradient',bgColor:'#2a1f5c',bgColor2:'#7c2f66',bgImage:'',bgFit:'cover',bgBlur:0,bgDim:30,uiOpacity:50,uiBlur:18,autoScrollBottom:true,filterLocal:true,pings:{everyone:true,sound:true,desktop:true},music:{enabled:true,volume:15,shuffle:true}});
    if(musicUnsub)musicUnsub();if(musicTimeUnsub)musicTimeUnsub();if(banListStop){banListStop();banListStop=null}if(muteListTimer){clearInterval(muteListTimer);muteListTimer=null}
    MusicPlayer.setBackground(false);
    DB.updateSettings(ME.id,s).catch(()=>{});
    ME=DB.currentUser();
    closeModalAnimated(root,()=>{applyStyle(document.documentElement,s);refitAllAvatars();MusicPlayer.applyPrefs(s.music);toast('Settings reset.')});
  };
  $$('#sSave').onclick=async()=>{
    read();
    if(s.font==='custom'&&!(s.customFont?CustomFont.valid(s.customFont):!!s.customFontData)){$$('#sErr').textContent='Custom font needs a valid font link (https://… .woff2 / .ttf / .otf, or Google Fonts) or an uploaded font file.';return}
    rememberFont();
    const b=$$('#sSave');b.disabled=true;b.textContent='Saving...';
    try{
      await DB.updateSettings(ME.id,s);
      ME=DB.currentUser();if(musicUnsub)musicUnsub();if(musicTimeUnsub)musicTimeUnsub();if(banListStop){banListStop();banListStop=null}if(muteListTimer){clearInterval(muteListTimer);muteListTimer=null}
      closeModalAnimated(root,()=>{
        applyStyle(document.documentElement,ME.settings);MusicPlayer.applyPrefs(ME.settings.music);toast('Saved!');
        // Re-render the message list immediately so a filter toggle change (or any other
        // setting affecting how messages are displayed) applies to already-loaded messages
        // right away, instead of waiting for the next unrelated re-render.
        if(typeof renderChat==='function')renderChat();
      });
    }catch(e){
      b.disabled=false;b.textContent='Save';
      $$('#sErr').textContent='Could not save: '+(e.code||e.message)+(/PERMISSION/i.test(e.code||e.message)?' — publish the updated database rules.':'');
    }
  };
  const _fs=$$('#sFont'),_ph=document.createComment('');_fs.replaceWith(_ph);
  enhanceRanges(root);enhanceSelects(root);enhanceColors(root);
  _ph.replaceWith(_fs);
  preview();
}

/* ==========================================================================
 * Custom font (paste a link). Saved as the account setting `customFont`
 * (synced across devices) alongside font:'custom'.
 * Accepts: https link to a .ttf/.otf/.woff/.woff2 file, or a Google Fonts css link.
 * ========================================================================== */
function fontKeys(){
  const k=Object.keys(FONTS);
  if(!k.includes('custom'))k.push('custom');
  return k;
}
const CustomFont=(function(){
  const FACE='ICHCustomFont',DEFAULT_HINT='Paste a font link, or upload a font file (.zip, .ttf, .otf, .woff, .woff2) from your device.';
  let family=FACE,loadedUrl='',face=null,linkEl=null,timer=0,installed=false,seq=0;
  function isGoogle(u){try{return new URL(u).hostname==='fonts.googleapis.com'}catch(_){return false}}
  function gFamily(u){
    try{return (new URL(u).searchParams.get('family')||'').split(':')[0].trim()}catch(_){return ''}
  }
  function valid(u){
    u=(u||'').trim();
    if(!u||u.length>300||/\s/.test(u))return false;
    try{
      const x=new URL(u);
      if(x.protocol!=='https:')return false;
      if(isGoogle(u))return !!gFamily(u);
      return /\.(ttf|otf|woff2?)$/i.test(x.pathname);
    }catch(_){return false}
  }
  function hint(t){const h=document.getElementById('sCustomFontHint');if(h)h.textContent=t}
  // Every load gets its own font name, so a new font can never be mixed up with the old one,
  // and a failed load falls back to the normal font instead of keeping the previous custom one.
  function dropFace(){if(face){try{document.fonts.delete(face)}catch(_){}face=null}}
  function reapply(){const f=document.getElementById('sFont');if(f)f.dispatchEvent(new Event('input',{bubbles:true}))}
  function load(u){
    if(u===loadedUrl)return;
    loadedUrl=u;
    hint('Loading font…');
    if(isGoogle(u)){
      if(!linkEl){linkEl=document.createElement('link');linkEl.rel='stylesheet';document.head.appendChild(linkEl)}
      family=gFamily(u);
      linkEl.onload=()=>{if(u===loadedUrl)hint('Font loaded ✓')};
      linkEl.onerror=()=>{if(u===loadedUrl){loadedUrl='';hint('Couldn’t load that font — check the link.')}};
      linkEl.href=u;
      return;
    }
    const fam=FACE+(++seq);
    family=fam;
    // new URL().href keeps %20 etc. as they are (encodeURI would turn %20 into %2520 and break the link)
    const f=new FontFace(fam,'url("'+new URL(u).href+'")');
    f.load().then(()=>{
      if(u!==loadedUrl)return;
      dropFace();document.fonts.add(f);face=f;hint('Font loaded ✓');
    }).catch(()=>{
      if(u===loadedUrl){loadedUrl='';dropFace();hint('Couldn’t load that font — check the link.')}
    });
  }
  function loadData(d,file){
    const key='data:'+d.length+':'+d.slice(-24);
    if(key===loadedUrl)return;
    loadedUrl=key;
    const fam=FACE+(++seq);
    family=fam;
    const bad=()=>{if(key===loadedUrl){loadedUrl='';dropFace();hint('That font file couldn’t be loaded.')}};
    try{
      const f=new FontFace(fam,b64ToBytes(d).buffer);
      f.load().then(()=>{
        if(key!==loadedUrl)return;
        dropFace();document.fonts.add(f);face=f;hint('Using uploaded font: '+(file||'font'));
      }).catch(bad);
    }catch(_){bad()}
  }
  // Called whenever styles are applied. While the settings box is open, wait a moment so
  // half-typed links don't fire requests; at boot / on another device, load straight away.
  function ensure(raw,data,file){
    const u=(raw||'').trim();
    clearTimeout(timer);
    if(!u&&data){loadData(data,file);return}
    const typing=!!document.getElementById('sCustomFont');
    if(!u){hint(DEFAULT_HINT);return}
    if(!valid(u)){hint('That doesn’t look like a font link (https:// … .woff2 / .ttf / .otf, or Google Fonts).');return}
    if(typing&&loadedUrl&&u!==loadedUrl)timer=setTimeout(()=>{load(u);reapply()},400);else load(u);
  }
  function install(){
    if(installed)return true;
    if(typeof FONTS==='undefined'||typeof applyStyle!=='function')return false;
    const sample=FONTS.system||FONTS[Object.keys(FONTS)[0]];
    if(typeof sample!=='string'){console.warn('[custom font] unexpected FONTS format, not installed');installed=true;return true}
    try{
      Object.defineProperty(FONTS,'custom',{enumerable:true,configurable:true,get:()=>'"'+family+'",system-ui,sans-serif'});
      const orig=applyStyle;
      applyStyle=function(el,s){
        try{if(s&&s.font==='custom')ensure(s.customFont,s.customFontData,s.customFontFile)}catch(_){}
        return orig.apply(this,arguments);
      };
      installed=true;
      // settings were applied before this hook existed (script load order) -> apply once more
      if(typeof ME!=='undefined'&&ME&&ME.settings&&ME.settings.font==='custom')applyStyle(document.documentElement,ME.settings);
    }catch(e){console.warn('[custom font] could not hook applyStyle',e);installed=true}
    return true;
  }
  if(!install()){
    const t=setInterval(()=>{if(install())clearInterval(t)},200);
    setTimeout(()=>clearInterval(t),20000);
  }
  return {valid,ensure,install};
})();

// Saved custom fonts: links kept one per line in the account setting `customFonts` (max 5).
function savedFonts(str){return String(str||'').split('\n').map(x=>x.trim()).filter(x=>x&&CustomFont.valid(x))}
function fontLabel(u){
  try{
    const x=new URL(u),g=x.searchParams.get('family');
    let n=(x.hostname==='fonts.googleapis.com'&&g)?g.split(':')[0]:decodeURIComponent(x.pathname.split('/').pop()||'').replace(/\.(ttf|otf|woff2?)$/i,'');
    n=n||x.hostname;
    return n.length>22?n.slice(0,21)+'…':n;
  }catch(_){return 'font'}
}

// Reading a font from a device file. Most font sites hand out .zip files, so zips are opened
// right in the browser (no library) and the best font inside is used (woff2 > woff > ttf > otf).
function b64ToBytes(d){
  const b=atob(String(d).slice(String(d).indexOf(',')+1)),u=new Uint8Array(b.length);
  for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
  return u;
}
function bytesToB64(u8){
  let t='';
  for(let i=0;i<u8.length;i+=0x8000)t+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
  return btoa(t);
}
async function fontFromZip(buf){
  const dv=new DataView(buf),u8=new Uint8Array(buf);
  let e=-1;
  for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-22-65535);i--){if(dv.getUint32(i,true)===0x06054b50){e=i;break}}
  if(e<0)throw new Error('That zip file couldn’t be read.');
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);
  const dec=new TextDecoder(),found=[];
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),usize=dv.getUint32(p+24,true);
    const nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nl));
    p+=46+nl+xl+cl;
    if(name.endsWith('/')||/(^|\/)(__MACOSX\/|\.)/.test(name))continue;
    const m=/\.(woff2|woff|ttf|otf)$/i.exec(name);
    if(m)found.push({name,method,csize,usize,off,ext:m[1].toLowerCase()});
  }
  if(!found.length)throw new Error('No font file (.ttf / .otf / .woff / .woff2) found in that zip.');
  const rank={woff2:0,woff:1,ttf:2,otf:3};
  found.sort((a,b)=>rank[a.ext]-rank[b.ext]||a.name.split('/').length-b.name.split('/').length||a.usize-b.usize);
  const f=found[0],ln=dv.getUint16(f.off+26,true),lx=dv.getUint16(f.off+28,true),start=f.off+30+ln+lx;
  const raw=u8.subarray(start,start+f.csize);
  let out;
  if(f.method===0)out=raw.slice();
  else if(f.method===8){
    if(typeof DecompressionStream==='undefined')throw new Error('Your browser can’t open zip files here — unzip it and pick the font file instead.');
    out=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }else throw new Error('That zip uses a compression type I can’t open — unzip it and pick the font file instead.');
  return {name:f.name.split('/').pop(),bytes:out,count:found.length};
}
async function readFontFile(file){
  const MAX=150000,buf=await file.arrayBuffer();
  let name=file.name,bytes=new Uint8Array(buf),count=1;
  if(/\.zip$/i.test(name)||(bytes[0]===0x50&&bytes[1]===0x4b)){
    const z=await fontFromZip(buf);name=z.name;bytes=z.bytes;count=z.count;
  }
  const m=/\.(woff2|woff|ttf|otf)$/i.exec(name);
  if(!m)throw new Error('Pick a .zip, .ttf, .otf, .woff or .woff2 file.');
  if(bytes.length>MAX)throw new Error('That font is too big ('+Math.round(bytes.length/1000)+' KB, max 150 KB). Try a .woff2 version or a smaller font.');
  try{await new FontFace('ICHTest',bytes.slice().buffer).load()}catch(_){throw new Error('That file isn’t a usable font.')}
  const mime={woff2:'font/woff2',woff:'font/woff',ttf:'font/ttf',otf:'font/otf'}[m[1].toLowerCase()];
  return {name:name.slice(0,60),count,dataUrl:'data:'+mime+';base64,'+bytesToB64(bytes)};
}
