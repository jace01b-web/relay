/* ==========================================================================
 * js/early/anti-lag-boot.js
 * Runs in <head> before first paint (so there is no flash of the heavy visuals).
 * ========================================================================== */
/* Anti-lag: per-device choice, OFF unless explicitly switched on. Runs before first paint so there is no flash of the heavy visuals. */
try{if(localStorage.getItem('ich.antiLag')==='1')document.documentElement.classList.add('anti-lag')}catch(_){}

/* Discord look: per-device cache of the account setting, OFF unless switched on. Applied before first paint. */
try{if(localStorage.getItem('ich.discordLook')==='1')document.documentElement.classList.add('discord-look')}catch(_){}

/* Discord look themes. Single source of truth: this table builds the CSS (below) AND the swatches in Settings.
   Each theme only sets the --dl-* palette variables used by css/22-discord-look.css. Nothing here applies unless html.discord-look is on. */
(function(){
  function dark(o){return Object.assign({text:'#dbdee1',muted:'#949ba4',head:'#f2f3f5',scroll:'#1a1b1e'},o)}
  // translucent panels over a gradient: tone = 'dark' | 'light'
  function grad(id,name,g,tone,pop){
    var d=tone!=='light';
    // solid panels (settings, profile card, menus, the user panel) pick up the theme: tint = the gradient's middle colour
    var cols=g.match(/#[0-9a-fA-F]{6}/g)||[],mid=cols[Math.min(1,cols.length-1)]||'#25262b';
    if(!pop)pop=d?'color-mix(in srgb,'+mid+' 78%,#000)':'color-mix(in srgb,'+mid+' 22%,#fff)';
    return{id:id,name:name,group:'color',sw:g,body:g,
      vars:d?{bg:'rgba(0,0,0,.22)',bg2:'rgba(0,0,0,.34)',bg3:'rgba(0,0,0,.46)',input:'rgba(0,0,0,.34)',hover:'rgba(255,255,255,.08)',active:'rgba(255,255,255,.15)',
        text:'#f2f3f5',muted:'#c4c8d0',head:'#fff',line:'rgba(255,255,255,.14)',scroll:'rgba(0,0,0,.4)',pop:pop||'#25262b'}
        :{bg:'rgba(255,255,255,.34)',bg2:'rgba(255,255,255,.5)',bg3:'rgba(255,255,255,.62)',input:'rgba(255,255,255,.6)',hover:'rgba(0,0,0,.06)',active:'rgba(0,0,0,.12)',
        text:'#23242a',muted:'#4f525b',head:'#0b0b0d',mention:'#3c45a5',line:'rgba(0,0,0,.14)',scroll:'rgba(0,0,0,.25)',pop:pop||'#f2f3f5'}};
  }
  var T=[
    // ---- Default themes (same four as Discord) ----
    {id:'light',name:'Light',group:'default',sw:'#ffffff',body:'#ffffff',vars:{bg:'#ffffff',bg2:'#f2f3f5',bg3:'#e3e5e8',input:'#ebedef',hover:'#e3e5e8',active:'#d7d9dd',text:'#313338',muted:'#5c5e66',head:'#060607',mention:'#3c45a5',line:'#e3e5e8',scroll:'#c1c3c8',pop:'#ffffff'}},
    {id:'ash',name:'Ash',group:'default',sw:'#313338',body:'#313338',vars:dark({bg:'#313338',bg2:'#2b2d31',bg3:'#1e1f22',input:'#383a40',hover:'#35373c',active:'#404249',line:'#3f4147',pop:'#313338'})},
    {id:'dark',name:'Dark',group:'default',sw:'#1a1a1e',body:'#1a1a1e',vars:dark({bg:'#1a1a1e',bg2:'#121214',bg3:'#0b0b0c',input:'#222327',hover:'#25262a',active:'#2e2f34',line:'#2a2b30',scroll:'#0b0b0c',pop:'#1a1a1e'})},
    {id:'onyx',name:'Onyx',group:'default',sw:'#000000',body:'#000000',vars:dark({bg:'#000000',bg2:'#050505',bg3:'#000000',input:'#121212',hover:'#141414',active:'#1e1e1e',line:'#1c1c1c',scroll:'#1c1c1c',pop:'#0a0a0a'})},
    // ---- Color themes (Discord's gradient themes; panels are see-through so the gradient shows across the whole app) ----
    grad('sunset','Sunset','linear-gradient(160deg,#2a1146 0%,#8a2f6b 50%,#f2765a 100%)','dark'),
    grad('chroma-glow','Chroma Glow','linear-gradient(160deg,#0b0b22 0%,#2a1a6e 50%,#0e8aa8 100%)','dark'),
    grad('forest','Forest','linear-gradient(160deg,#0b1a10 0%,#1f4a2c 55%,#4f8a54 100%)','dark'),
    grad('crimson-moon','Crimson Moon','linear-gradient(160deg,#0d0406 0%,#3a0a14 55%,#7a1626 100%)','dark'),
    grad('midnight-blurple','Midnight Blurple','linear-gradient(160deg,#090a24 0%,#25308f 55%,#5865f2 100%)','dark'),
    grad('mars','Mars','linear-gradient(160deg,#1f0a07 0%,#6e2616 55%,#c9582f 100%)','dark'),
    grad('dusk','Dusk','linear-gradient(160deg,#15152b 0%,#4b3d6e 55%,#b88596 100%)','dark'),
    grad('under-the-sea','Under the Sea','linear-gradient(160deg,#031a28 0%,#07607a 55%,#35b5ac 100%)','dark'),
    grad('retro-storm','Retro Storm','linear-gradient(160deg,#141826 0%,#34425c 55%,#6f819f 100%)','dark'),
    grad('neon-nights','Neon Nights','linear-gradient(160deg,#08000f 0%,#4a0a9a 55%,#00c8e6 100%)','dark'),
    grad('strawberry-lemonade','Strawberry Lemonade','linear-gradient(160deg,#5c1030 0%,#c4306a 50%,#f0b445 100%)','dark'),
    grad('aurora','Aurora','linear-gradient(160deg,#06141c 0%,#1b6e62 50%,#6a3fb5 100%)','dark'),
    grad('sepia','Sepia','linear-gradient(160deg,#241c13 0%,#4f402d 55%,#8a7556 100%)','dark'),
    grad('mint-apple','Mint Apple','linear-gradient(160deg,#bff3d4 0%,#e7f9cf 100%)','light'),
    grad('citrus-sherbert','Citrus Sherbert','linear-gradient(160deg,#ffe08a 0%,#ffb9a0 100%)','light'),
    grad('retro-raincloud','Retro Raincloud','linear-gradient(160deg,#c6d1df 0%,#eaeef4 100%)','light'),
    grad('hanami','Hanami','linear-gradient(160deg,#ffcfe3 0%,#fff1f6 100%)','light'),
    grad('sunrise','Sunrise','linear-gradient(160deg,#ffc58f 0%,#ffe6d2 50%,#ffb0c4 100%)','light'),
    grad('cotton-candy','Cotton Candy','linear-gradient(160deg,#ffc2ea 0%,#b4d2ff 100%)','light'),
    grad('lofi-vibes','Lofi Vibes','linear-gradient(160deg,#e3cff4 0%,#f7ddd6 100%)','light'),
    grad('desert-khaki','Desert Khaki','linear-gradient(160deg,#e4d6b4 0%,#f6efdc 100%)','light')
  ];
  // theme ids from the earlier version -> their closest Discord theme (so saved choices keep working)
  var ALIAS={mint:'mint-apple',peach:'citrus-sherbert',periwinkle:'cotton-candy',citrus:'citrus-sherbert',cotton:'cotton-candy',sky:'retro-raincloud',sand:'desert-khaki',twilight:'sunset',neon:'neon-nights',crimson:'crimson-moon',midnight:'midnight-blurple',terracotta:'mars',lagoon:'under-the-sea',coffee:'sepia',royal:'midnight-blurple'};
  window.DL_THEME_ALIAS=ALIAS;
  var css='';
  T.forEach(function(t){
    var v=t.vars,o='';
    // solid twins of bg/bg2/bg3/input for surfaces that must never be see-through (settings, profile cards, menus)
    if(t.group==='color'){var lt=/^rgba\(255/.test(v.bg),m=lt?'#000':'#000';
      v.sbg=v.pop;v.sbg2='color-mix(in srgb,'+v.pop+' '+(lt?94:84)+'%,'+m+')';v.sbg3='color-mix(in srgb,'+v.pop+' '+(lt?88:66)+'%,'+m+')';v.sinput=v.sbg3;
    }else{v.sbg=v.bg;v.sbg2=v.bg2;v.sbg3=v.bg3;v.sinput=v.input}for(var k in v)o+='--dl-'+k+':'+v[k]+';';
    css+='html.discord-look[data-dl-theme="'+t.id+'"]{'+o+'--dl-body:'+t.body+';}\n';
  });
  window.DL_THEMES=T;
  try{var st=document.createElement('style');st.id='dl-themes';st.textContent=css;document.head.appendChild(st)}catch(_){}
  try{var id=localStorage.getItem('ich.discordTheme');id=ALIAS[id]||id;if(id&&T.some(function(t){return t.id===id}))document.documentElement.setAttribute('data-dl-theme',id)}catch(_){}
})();
