/* ==========================================================================
 * js/manifest.js - the one list of files the site loads.
 *
 *   css : stylesheets inside /css, applied in this order (later files override earlier ones).
 *         NOTE: index.html fetches the stylesheets itself (it has to - they come from the raw repo,
 *         which browsers refuse to apply through <link>), so the CSS list that actually loads is the
 *         one in index.html. This copy must be kept identical to it; it is the documentation of the
 *         order, and the single-file build in dist/ uses it.
 *   js  : scripts inside /js, executed in this order. They share one global scope, so a file can
 *         only USE things at load time that an earlier file already defined. (Functions that are
 *         merely called later, from clicks/timers/etc., can live anywhere.)
 *
 * To add a feature: create the file, then add its path here.
 * ========================================================================== */
window.APP_MANIFEST={
  firebase:{version:"10.12.2",modules:["firebase-app","firebase-auth","firebase-app-check","firebase-database"],storage:"firebase-storage"},
  css:[
    "01-base.css",
    "02-now-playing.css",
    "03-form-controls.css",
    "04-layout-background.css",
    "05-auth-home-basics.css",
    "06-chat.css",
    "07-modals-pickers.css",
    "08-overlays-friends.css",
    "09-game-hubs.css",
    "10-profile-cropper-composer.css",
    "11-glass-theme.css",
    "12-vip-spin.css",
    "13-auth-page.css",
    "14-extras-menu.css",
    "15-anti-lag.css",
    "16-rules-modal.css",
    "17-halloween.css",
    "18-music-profile-cosmetics.css",
    "19-mobile-sidebar.css",
    "20-voice-channel.css",
    "22-discord-look.css",
    "24-file-attachments.css",
    "25-custom-roles.css",
    "26-trick-or-treat.css"
  ],
  /* Not loaded on purpose: 23-lockdown.css belongs to js/features/lockdown.js, which is kept in the
     repo but left out of the load list (its master switch is ON, so loading it would lock the site). */
  js:[
    "core/firebase-imports.js",
    "core/diagnostics.js",
    "core/config.js",
    "chat/emoji-data.js",
    "moderation/content-filter.js",
    "core/name-styles.js",
    "core/helpers.js",
    "core/firebase-init.js",
    "chat/file-upload.js",
    "moderation/roles.js",
    "moderation/nsfw-filter.js",
    "moderation/bans.js",
    "core/database.js",
    "core/state.js",
    "features/gift-promo.js",
    "chat/pings.js",
    "core/auto-update.js",
    "core/sound.js",
    "tools/music-player.js",
    "tools/now-playing.js",
    "ui/controls.js",
    "ui/navigation.js",
    "auth/auth.js",
    "ui/modals.js",
    "ui/home.js",
    "features/vip-and-spin.js",
    "ui/sidebar-toggle.js",
    "games/game-hubs.js",
    "chat/chat-view.js",
    "social/user-profile.js",
    "chat/chat-header.js",
    "chat/messages.js",
    "chat/emoji-picker.js",
    "chat/text-and-media.js",
    "chat/composer.js",
    "ui/keyboard-shortcuts.js",
    "chat/attachments.js",
    "settings/appearance.js",
    "settings/rules.js",
    "settings/settings-page.js",
    "settings/account.js",
    "features/halloween.js",
    "features/trick-or-treat-games.js",
    "features/trick-or-treat.js",
    "settings/rules-check.js",
    "moderation/tos-gate.js",
    "settings/anti-lag.js",
    "social/rooms.js",
    "social/friends.js",
    "chat/live-sync.js",
    "chat/typing-indicator.js",
    "ui/extras-menu.js",
    "ui/liquid-glass.js",
    "ui/discord-shell.js",
    "ui/context-menu.js",
    "core/boot.js"
  ]
};
