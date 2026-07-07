/* Hand-authored pixel sprites. Each: palette map + row strings. '.' = transparent. */
const SPRITES = {
  fenn: { // the Wayfarer — hooded runner, grey beard
    p: { g: '#2e4a2a', G: '#4d7a42', f: '#d8a878', K: '#1a1410', w: '#cfc8b0', s: '#8a6848' },
    r: [
      '................',
      '....gggggggg....',
      '...gGGGGGGGGg...',
      '..gGGGGGGGGGGg..',
      '..gGGffffffGGg..',
      '..gGffffffffGg..',
      '..gGfKffffKfGg..',
      '..gGffffsfffGg..',
      '..gGffwwwwffGg..',
      '..gGwwwwwwwwGg..',
      '...gwwwwwwwwg...',
      '...ggwwwwwwgg...',
      '..ggGGGGGGGGgg..',
      '.ggGGGgGGgGGGgg.',
      '.gGGGGgGGgGGGGg.',
      '................',
    ],
  },
  grunhilda: { // Iron-Bell — dwarf, red braids, iron circlet
    p: { h: '#b84a20', H: '#d86a30', f: '#e0b088', K: '#1a1410', m: '#c04030', i: '#8a8a9a', d: '#6a3a18' },
    r: [
      '................',
      '....iiiiiiii....',
      '...hhhhhhhhhh...',
      '..hHHHHHHHHHHh..',
      '.hHffffffffffHh.',
      '.hHfKffffffKfHh.',
      '.hHffffffffffHh.',
      '.hHffmmmmmmffHh.',
      '.hHfhhhhhhhhfHh.',
      '.hHhhhhhhhhhhHh.',
      '.hHh.hhhhhh.hHh.',
      '.hHh.dddddd.hHh.',
      '.hhh.dddddd.hhh.',
      '..h..dddddd..h..',
      '.....dddddd.....',
      '................',
    ],
  },
  bram: { // the Loadbearer — knight, plumed helm
    p: { s: '#9aa0b0', S: '#c8ccd8', p: '#c04040', K: '#101018', f: '#d8a878' },
    r: [
      '.......pp.......',
      '......pppp......',
      '.....pppppp.....',
      '....ssssssss....',
      '...sSSSSSSSSs...',
      '..sSSSSSSSSSSs..',
      '..sSSKssssKSSs..',
      '..sSSssssssSSs..',
      '..sSSSffffSSSs..',
      '..sSSSSSSSSSSs..',
      '...ssssssssss...',
      '..ssSSssssSSss..',
      '.ssSSSSssSSSSss.',
      '.sSSSSssssSSSSs.',
      '.ssssss..ssssss.',
      '................',
    ],
  },
  elowen: { // Sage of the Willow — green cowl, calm
    p: { v: '#3a5a3a', V: '#5a8a55', f: '#e8d0b0', K: '#1a1410', l: '#8ac05e' },
    r: [
      '................',
      '.....vvvvvv.....',
      '....vVVVVVVv....',
      '...vVVVVVVVVv...',
      '...vVffffffVv...',
      '...vVffffffVv...',
      '...vVfKffKfVv...',
      '...vVffffffVv...',
      '...vVfffff.Vv...',
      '...vVVffffVVl...',
      '....vVVVVVVll...',
      '....vVVVVVVvl...',
      '...vVVVVVVVVv...',
      '..vVVVVvvVVVVv..',
      '..vvvvv..vvvvv..',
      '................',
    ],
  },
  pip: { // the Peddler — cap and moustache
    p: { c: '#6a4a8a', C: '#8a62b0', f: '#d8a878', K: '#1a1410', m: '#5a3a20', t: '#b09858' },
    r: [
      '................',
      '....cccccccc....',
      '...cCCCCCCCCc...',
      '..cCCCCCCCCCCc..',
      '..cccccccccccc..',
      '..cffffffffffc..',
      '..cfKffffffKfc..',
      '...ffffffffff...',
      '...fmmmmmmmmf...',
      '...ffmffffmff...',
      '....ffffffff....',
      '...ttttttttttt..',
      '..ttttttttttttt.',
      '..tt.tttttt.tt..',
      '..tt.tttttt.tt..',
      '................',
    ],
  },
  hesk: { // Warden of the Undercroft — dark helm, ember eyes
    p: { d: '#2a2a38', D: '#42425a', e: '#e08030', k: '#14141e' },
    r: [
      '................',
      '....dddddddd....',
      '...dDDDDDDDDd...',
      '..dDDDDDDDDDDd..',
      '..dDDkkkkkkDDd..',
      '..dDkkkkkkkkDd..',
      '..dDkeekkeekDd..',
      '..dDkkkkkkkkDd..',
      '..dDDkkkkkkDDd..',
      '..dDDDDDDDDDDd..',
      '...dddDDDDddd...',
      '..ddDDDDDDDDdd..',
      '.ddDDDdddDDDDdd.',
      '.dDDDDdddDDDDDd.',
      '.dddddd..dddddd.',
      '................',
    ],
  },
  krank: { // the Krankwerk — brass gumball contraption
    p: { b: '#8a6a28', B: '#c9a24b', G: '#22303a', r: '#c04040', u: '#6aa0c8', y: '#e0c060', k: '#14141e' },
    r: [
      '................',
      '.....kkkkkk.....',
      '....kGGGGGGk....',
      '...kGGruGyGGk...',
      '...kGyGGrGuGk...',
      '...kGGuGyGGGk...',
      '....kGGGGGGk....',
      '...BBBBBBBBBB...',
      '..BbbbbbbbbbbB..',
      '..BbBBBBBBBBbB.y',
      '..BbBkkkkkkBbByy',
      '..BbBkkkkkkBbB.y',
      '..BbBBBBBBBBbB..',
      '..BbbbbbbbbbbB..',
      '..BBBBBBBBBBBB..',
      '................',
    ],
  },
  // ---- monsters (12x12) ----
  rat: {
    p: { b: '#8a7058', B: '#a89078', e: '#e05050', t: '#c89898' },
    r: ['............','............','..b......b..','..bb....bb..','..bBBBBBBb..','.bBBBBBBBBb.','.bBeBBBBeBb.','.bBBBBBBBBb.','..bBBBBBBbt.','...bbbbbb.tt','..b..b..b..t','............'],
  },
  bat: {
    p: { p: '#5a4a7a', P: '#7a68a0', e: '#e0c040', k: '#241c30' },
    r: ['............','.p........p.','.pp......pp.','.ppp.pp.ppp.','.pppPPPPppp.','.ppPPPPPPpp.','..pPePPePp..','..pPPPPPPp..','...pPkkPp...','....pppp....','.....pp.....','............'],
  },
  slime: {
    p: { s: '#4a8a3a', S: '#6ab050', e: '#142014', h: '#a0e080' },
    r: ['............','............','............','....ssss....','..ssSSSSss..','.sSSShSSSSs.','.sSSSSSSSSs.','.sSeSSSSeSs.','sSSSSSSSSSSs','sSSSSSSSSSSs','.ssssssssss.','............'],
  },
  skeleton: {
    p: { w: '#d8d0c0', k: '#181410', g: '#8a8478' },
    r: ['............','....wwww....','...wwwwww...','...wkwwkw...','...wwwwww...','....wkkw....','..wwwwwwww..','.w.wwwwww.w.','.w..wwww..w.','....wwww....','...ww..ww...','...w....w...'],
  },
  cultist: {
    p: { r: '#6a2030', R: '#8a3040', k: '#100c10', e: '#e0c040' },
    r: ['............','....rrrr....','...rRRRRr...','..rRRRRRRr..','..rRkkkkRr..','..rRkekeRr..','..rRkkkkRr..','..rRRRRRRr..','.rRRRRRRRRr.','.rRRrRRrRRr.','.rrRRRRRRrr.','............'],
  },
  ghoul: {
    p: { g: '#7a8a5a', G: '#98a878', e: '#e05050', k: '#202418' },
    r: ['............','....gggg....','...gGGGGg...','...gGGGGg...','..gGeGGeGg..','..gGGGGGGg..','...gkkkkg...','..ggGGGGgg..','.g.gGGGGg.g.','.g.gGGGGg.g.','...gg..gg...','...g....g...'],
  },
  wraith: {
    p: { v: '#4a4a6a', V: '#6a6a95', e: '#80e0e0', k: '#181826' },
    r: ['............','....vvvv....','...vVVVVv...','..vVkkkkVv..','..vVkekeVv..','..vVkkkkVv..','..vVVVVVVv..','..vVVVVVVv..','...vVVVVv...','...vVvVvV...','....v.v.v...','............'],
  },
  troll: {
    p: { t: '#5a7050', T: '#78956a', e: '#e0a030', k: '#242c20', n: '#a8b898' },
    r: ['............','..tttttttt..','.tTTTTTTTTt.','.tTeTTTTeTt.','.tTTTnnTTTt.','.tTnnnnnnTt.','.ttTTTTTTtt.','tTTtTTTTtTTt','tTTtTTTTtTTt','.tt.tttt.tt.','....t..t....','....t..t....'],
  },
  drake: {
    p: { d: '#a05828', D: '#c87838', e: '#e0e040', w: '#78380f', k: '#301808' },
    r: ['............','.w........w.','.ww..dd..ww.','.wwwdDDdwww.','..wdDDDDdw..','..dDeDDeDd..','..dDDDDDDd..','...dDkkDd...','..dDDDDDDd..','...ddDDdd...','....d..d....','............'],
  },
  boss1: { // Gatekeeper of Sloth — armored hulk
    p: { s: '#6a6a80', S: '#9090a8', e: '#e05050', k: '#181820' },
    r: ['.ss......ss.','.sss....sss.','..ssssssss..','..sSSSSSSs..','..sSkkkkSs..','..sSkeekSs..','..sSkkkkSs..','.ssSSSSSSss.','sSSsSSSSsSSs','sSSsSSSSsSSs','.ss.ssss.ss.','....s..s....'],
  },
  boss2: { // Grandmother Rot
    p: { g: '#4a6a3a', G: '#688a50', e: '#e0e060', k: '#1c2414', w: '#a8a888' },
    r: ['............','..gggggggg..','.gGGGGGGGGg.','.gGeGGGGeGg.','.gGGGkkGGGg.','.gGkwwwwkGg.','.gGGkkkkGGg.','..gGGGGGGg..','.gGgGGGGgGg.','.gGgGGGGgGg.','..g.gggg.g..','............'],
  },
  boss3: { // The Hollow King — crowned void
    p: { y: '#e0c060', v: '#3a3a58', V: '#585880', e: '#e080e0', k: '#100c18' },
    r: ['.y.y.yy.y.y.','.yyyyyyyyyy.','..vVVVVVVv..','..vVkkkkVv..','..vVkekeVv..','..vVkkkkVv..','..vVVVVVVv..','.vVVVVVVVVv.','.vVVVVVVVVv.','..vVvVVvVv..','...v.vv.v...','............'],
  },
  hero: { // you, in the dark
    p: { a: '#7a7a90', A: '#a8a8c0', f: '#d8a878', K: '#181410', c: '#8a3040' },
    r: ['............','....aaaa....','...aAAAAa...','...affffa...','...fKffKf...','....ffff....','..ccaAAacc..','.c.aAAAAa.c.','.c.aAAAAa.c.','...aa..aa...','...aa..aa...','...a....a...'],
  },
};

/* ---- item sprites (12x12), some share row templates with palette swaps ---- */
const ROWS_POTION = [
  '............', '....kkkk....', '....kcck....', '....kcck....', '...kkkkkk...',
  '..kRRRRRRk..', '.kRrrRRRRRk.', '.kRrRRRRRRk.', '.kRRRRRRRRk.', '..kRRRRRRk..',
  '...kkkkkk...', '............',
];
const ROWS_BOMB = [
  '........yy..', '.......y....', '......kk....', '...kkkkkkk..', '..kkWWkkkkk.',
  '..kWkkkkkkk.', '..kkkkkkkkk.', '..kkkkkkkkk.', '...kkkkkkk..', '....kkkkk...',
  '............', '............',
];
const ROWS_SWORD = [
  '.....WS.....', '.....WS.....', '.....WS.....', '.....WS.....', '.....WS.....',
  '.....WS.....', '..gggggggg..', '.....bb.....', '.....bb.....', '.....bb.....',
  '....gggg....', '............',
];
const ROWS_ARMOR = [
  '..k......k..', '..kk....kk..', '..kkBBBBkk..', '.kkBBBBBBkk.', '.kBBbBBbBBk.',
  '..BBBBBBBB..', '..BBbBBbBB..', '..BBBBBBBB..', '..BBbBBbBB..', '...BBBBBB...',
  '...BBBBBB...', '............',
];

Object.assign(SPRITES, {
  potion:     { p: { k: '#241a20', c: '#b09858', R: '#c04040', r: '#e07070' }, r: ROWS_POTION },
  potion_big: { p: { k: '#241a20', c: '#b09858', R: '#d84848', r: '#f09090' }, r: ROWS_POTION },
  flask_iron: { p: { k: '#1a2028', c: '#b09858', R: '#5a7a9a', r: '#8aaac8' }, r: ROWS_POTION },
  bomb:       { p: { k: '#20202a', W: '#3c3c4e', y: '#e0c060' }, r: ROWS_BOMB },
  smoke:      { p: { k: '#5a5a68', W: '#8a8a98', y: '#b8b8c2' }, r: ROWS_BOMB },
  sword_rusty:{ p: { W: '#a08858', S: '#7a6038', g: '#6a5a30', b: '#4a3520' }, r: ROWS_SWORD },
  sword:      { p: { W: '#d8dce8', S: '#9aa0b0', g: '#c9a24b', b: '#5a3a20' }, r: ROWS_SWORD },
  runeblade:  { p: { W: '#d0a8f0', S: '#8a58c0', g: '#e0c060', b: '#3a2a50' }, r: ROWS_SWORD },
  vest:       { p: { k: '#3a2a18', B: '#8a6a40', b: '#6a4e2c' }, r: ROWS_ARMOR },
  chain:      { p: { k: '#2a2a34', B: '#8a8a9a', b: '#5c5c6e' }, r: ROWS_ARMOR },
  plate_armor:{ p: { k: '#2a2a34', B: '#c0c4d4', b: '#8a8fa5' }, r: ROWS_ARMOR },
  cloak: { p: { k: '#3a1a10', R: '#c05828', r: '#e08048' }, r: [
    '....kkkk....', '...kRRRRk...', '..kRRRRRRk..', '..kRRRRRRk..', '.kRRRRRRRRk.',
    '.kRRrrRRRRk.', '.kRRRRRRRRk.', '.kRRRRRRRRk.', '..RRRRRRRR..', '..RR....RR..',
    '............', '............',
  ]},
  whetstone: { p: { k: '#20202a', s: '#7a7a88', S: '#a8a8b8' }, r: [
    '............', '............', '............', '...kkkkkkk..', '..ksssssssk.',
    '..ksSSSSssk.', '..ksssssssk.', '...kkkkkkk..', '............', '............',
    '............', '............',
  ]},
  torch_item: { p: { r: '#e07030', y: '#f0d060', w: '#6a4e2c', W: '#8a6a40' }, r: [
    '.....yy.....', '....ryyr....', '....ryyr....', '.....rr.....', '....wWWw....',
    '.....WW.....', '.....WW.....', '.....WW.....', '.....WW.....', '.....WW.....',
    '............', '............',
  ]},
  bread: { p: { b: '#c09858', B: '#e0c088', k: '#7a5a30' }, r: [
    '............', '............', '............', '...bbbbbb...', '..bBBBBBBb..',
    '.bBBkBBkBBb.', '.bBBBBBBBBb.', '.bbBBBBBBbb.', '..bbbbbbbb..', '............',
    '............', '............',
  ]},
  hammer: { p: { k: '#20202a', s: '#8a8a9a', S: '#b8bcc8', w: '#6a4e2c' }, r: [
    '..kkkkkkk...', '..ksSSSsk...', '..ksssssk...', '..kkkkkkk...', '.....ww.....',
    '.....ww.....', '.....ww.....', '.....ww.....', '.....ww.....', '.....ww.....',
    '............', '............',
  ]},
  pendant: { p: { k: '#c9a24b', g: '#2a5a2a', G: '#5aa05a' }, r: [
    '...k....k...', '..k......k..', '..k......k..', '...k....k...', '....k..k....',
    '.....kk.....', '....gggg....', '...gGGGGg...', '...gGGGGg...', '....gggg....',
    '............', '............',
  ]},
  ring: { p: { g: '#c9a24b', G: '#f0d080', r: '#c04060' }, r: [
    '............', '.....rr.....', '....rrrr....', '.....rr.....', '....gGGg....',
    '...gG..Gg...', '...gG..Gg...', '...gG..Gg...', '....gGGg....', '............',
    '............', '............',
  ]},
  clover: { p: { g: '#4a8a3a', G: '#6ab050', s: '#2e5a24' }, r: [
    '............', '..GG....GG..', '.GGGG..GGGG.', '.GGGGggGGGG.', '..GGgggGG...',
    '.GGGGggGGGG.', '.GGGG..GGGG.', '..GG..s.GG..', '......s.....', '.....s......',
    '............', '............',
  ]},
  amulet: { p: { k: '#c9a24b', y: '#f0d080', Y: '#f8e8b0' }, r: [
    '...k....k...', '..k......k..', '..k......k..', '...k....k...', '....kkkk....',
    '...kyyyyk...', '..kyYYYYyk..', '..kyYYYYyk..', '...kyyyyk...', '....kkkk....',
    '............', '............',
  ]},
  rock: { p: { s: '#7a7a80', S: '#9a9aa2', k: '#14141a' }, r: [
    '............', '............', '............', '....ssss....', '..ssSSSSss..',
    '.sSSkSSkSSs.', '.sSSSSSSSSs.', '.sSSSssSSSs.', '..ssssssss..', '............',
    '............', '............',
  ]},
  spoon: { p: { w: '#8a6a40', W: '#b09060' }, r: [
    '....WWW.....', '...WWWWW....', '...WWwWW....', '....WWW.....', '.....ww.....',
    '.....ww.....', '.....ww.....', '.....ww.....', '.....ww.....', '.....ww.....',
    '............', '............',
  ]},
  boot: { p: { b: '#6a4e2c', B: '#8a6a40', k: '#3a2a18' }, r: [
    '............', '....bbb.....', '....bBb.....', '....bBb.....', '....bBb.....',
    '....bBbb....', '....bBBbbb..', '....bBBBBb..', '....kkkkkk..', '............',
    '............', '............',
  ]},
  bellfig: { p: { g: '#c9a24b', G: '#f0d080' }, r: [
    '............', '....gggg....', '...gg..gg...', '...gg..gg...', '..gggggggg..',
    '.gGGGGGGGGg.', '.gGGGGGGGGg.', '.gGGGGGGGGg.', '..gggggggg..', '............',
    '............', '............',
  ]},
});

/* ---- dungeon map icons (8x8) ---- */
Object.assign(SPRITES, {
  icon_skull:  { p: { w: '#d8d0c0', K: '#181410' }, r: ['........', '..wwww..', '.wwwwww.', '.wKwwKw.', '.wwwwww.', '..wwww..', '..w..w..', '........'] },
  icon_chest:  { p: { k: '#3a2a18', g: '#8a6a40', y: '#e0c060' }, r: ['........', '.kkkkkk.', '.kggggk.', '.kkkkkk.', '.kggygk.', '.kggggk.', '.kkkkkk.', '........'] },
  icon_shrine: { p: { y: '#6aa0c8' }, r: ['........', '...yy...', '...yy...', '.yyyyyy.', '...yy...', '...yy...', '...yy...', '........'] },
  icon_stairs: { p: { g: '#f0d080' }, r: ['........', '......gg', '....gggg', '..gggggg', 'gggggggg', '........', '........', '........'] },
  icon_up:     { p: { g: '#7ab55c' }, r: ['........', '...gg...', '..gggg..', '.gggggg.', '...gg...', '...gg...', '...gg...', '........'] },
  icon_relic:  { p: { y: '#f0d080', s: '#8a8a98' }, r: ['...yy...', '..yyyy..', '...yy...', '..ssss..', '..ssss..', '.ssssss.', 'ssssssss', '........'] },
});

/* ---- town buildings (~24x20) ---- */
Object.assign(SPRITES, {
  bld_waystone: { p: { s: '#8a8a98', S: '#a8a8b8', r: '#c9a24b', w: '#6a4e2c', W: '#8a6a40', g: '#3e6234' }, r: [
    '........................', '........................', '...WWWWWWW..............',
    '...WwwwwwW....sss.......', '...WWWWWWW...sSSSs......', '......ww....sSSSSSs.....',
    '......ww....sSSrSSs.....', '...WWWWWWW..sSSSSSs.....', '...WwwwwwW..sSrSrSs.....',
    '...WWWWWWW..sSSSSSs.....', '......ww....sSSSSSs.....', '......ww....sSSrSSs.....',
    '......ww....sSSSSSs.....', '......ww....sSSSSSs.....', '......ww....sSSSSSs.....',
    '.....wwww...sssssss.....', '....gggggggggggggggg....', '..gggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_forge: { p: { s: '#5a5a68', S: '#7a7a88', r: '#8a3020', o: '#e07030', y: '#f0d060', k: '#181820', m: '#3a3a46', g: '#3e6234' }, r: [
    '.......mm...............', '.......mm...............', '......mmm......rrrr.....',
    '....rrrrrrrrrrrrrrrr....', '...rrrrrrrrrrrrrrrrrr...', '..rrrrrrrrrrrrrrrrrrrr..',
    '..SSSSSSSSSSSSSSSSSSSS..', '..SssSSSSSSSSSSSSSssSS..', '..SSSSSkkkkkkkkSSSSSSS..',
    '..SSSSSkkooookkSSSSSSS..', '..SssSSkkoyyokkSSSssSS..', '..SSSSSkkooookkSSSSSSS..',
    '..SSSSSkkkkkkkkSSSSSSS..', '..SSSSSkkkkkkkkSSkkSSS..', '..SSSSSkkkkkkkkSkkkkSS..',
    '..SSSSSSSSSSSSSSkkkkSS..', '..ggggggggggggggggggggg.', '.gggggggggggggggggggggg.',
    '........................', '........................',
  ]},
  bld_keep: { p: { s: '#9aa0b0', S: '#c0c4d4', r: '#c04040', k: '#20202c', g: '#3e6234' }, r: [
    '.....r..................', '.....rr.................', '.....rrr................',
    '.....s..................', '..ss.ss.ss..............', '..sssssssss.............',
    '..sSSSSSSSs.............', '..sSSkkSSSs...ss.ss.ss..', '..sSSkkSSSs...ssssssss..',
    '..sSSSSSSSs...sSSSSSSs..', '..sSSSSSSSs...sSkkSSSs..', '..sSSkkSSSs...sSkkSSSs..',
    '..sSSkkSSSs...sSSSSSSs..', '..sSSkkSSSs...sSSkkSSs..', '..sSSkkSSSs...sSSkkSSs..',
    '..sssssssss...ssssssss..', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_willow: { p: { t: '#5a4028', T: '#7a5a38', v: '#3a6a34', V: '#5a9a50', l: '#7ec06a', g: '#3e6234' }, r: [
    '........vvvvvvvv........', '......vvVVVVVVVVvv......', '....vvVVVVVVVVVVVVvv....',
    '...vVVVVVVVVVVVVVVVv....', '..vVVVVVVVVVVVVVVVVVv...', '..vVlVVlVVVlVVVlVVlVv...',
    '..vVlVVlVVVlVVVlVVlVv...', '...vlVVlVVVlVVVlVVlv....', '....lVVlVVVlVVVlVVl.....',
    '....l..l..TT...l..l.....', '..........TT............', '..........TT............',
    '..........TT............', '.........TTTT...........', '.........TTTT...........',
    '........TTTTTT..........', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_stall: { p: { a: '#8a62b0', A: '#e8e0d0', w: '#6a4e2c', W: '#8a6a40', y: '#e0c060', g: '#3e6234' }, r: [
    '........................', '........................', '..aAaAaAaAaAaAaAaAaA....',
    '..aAaAaAaAaAaAaAaAaA....', '..aaaaaaaaaaaaaaaaaa....', '..w................w....',
    '..w................w....', '..w..yy...yy...yy..w....', '..w.yyyy.yyyy.yyyy.w....',
    '..WWWWWWWWWWWWWWWWWW....', '..WwwwwwwwwwwwwwwwwW....', '..WWWWWWWWWWWWWWWWWW....',
    '..w................w....', '..w................w....', '..w................w....',
    '..w................w....', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_gate: { p: { s: '#4a4a58', S: '#62626e', k: '#0a0a10', w: '#d8d0c0', g: '#3e6234' }, r: [
    '........................', '........................', '.......ssssssssss.......',
    '.....ssSSSSSSSSSSss.....', '....sSSSSSwwSSSSSSSs....', '...sSSSSSwwwwSSSSSSSs...',
    '...sSSSSSSwwSSSSSSSSs...', '..sSSSSkkkkkkkkSSSSSSs..', '..sSSSkkkkkkkkkkSSSSSs..',
    '..sSSSkkkkkkkkkkSSSSSs..', '..sSSkkkkkkkkkkkkSSSSs..', '..sSSkkkkkkkkkkkkSSSSs..',
    '..sSSkkkkkkkkkkkkSSSSs..', '..sSSkkkkkkkkkkkkSSSSs..', '..sSSkkkkkkkkkkkkSSSSs..',
    '..sSSkkkkkkkkkkkkSSSSs..', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_hall: { p: { c: '#c8bc98', C: '#e0d8b8', r: '#8a6a40', k: '#2a2a34', g: '#3e6234' }, r: [
    '........................', '........................', '...........rr..........',
    '.......rrrrrrrrrr.......', '....rrrrrrrrrrrrrrrr....', '..rrrrrrrrrrrrrrrrrrrr..',
    '..CCCCCCCCCCCCCCCCCCCC..', '..CccCCccCCccCCccCCccC..', '..Ccc.Ccc.Ccc.Ccc.CccC..',
    '..Ccc.Ccc.Ccc.Ccc.CccC..', '..Ccc.Ccc.Ccc.Ccc.CccC..', '..Ccc.Ccc.Ccc.Ccc.CccC..',
    '..Ccc.Ccc.kkk.Ccc.CccC..', '..Ccc.Ccc.kkk.Ccc.CccC..', '..Ccc.Ccc.kkk.Ccc.CccC..',
    '..CCCCCCCCkkkCCCCCCCCC..', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_ledger: { p: { w: '#6a4e2c', W: '#8a6a40', p: '#e0d8b8', k: '#20202c', r: '#8a3020', g: '#3e6234', q: '#d8d0c0' }, r: [
    '........................', '........................', '.......rrrrrrrrrr.......',
    '.....rrrrrrrrrrrrrr.....', '...rrrrrrrrrrrrrrrrrr...', '...pppppppppppppppppp...',
    '...pWWppppWWppppWWpp....', '...pWWppppWWppppWWpp....', '...pppppppppppppppppp...',
    '...ppppkkkkkkpppppppp...', '...pWWpkqqqqkppppWWpp...', '...pWWpkqqqqkppppWWpp...',
    '...ppppkqqqqkpppppppp...', '...ppppkkkkkkpppppppp...', '...ppppkkkkkkpppppppp...',
    '...pppppppppppppppppp...', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_yard: { p: { w: '#6a4e2c', W: '#8a6a40', k: '#2a2a34', s: '#8a8a9a', g: '#3e6234' }, r: [
    '........................', '........................', '........................',
    '..ww..................w.', '..ww..................w.', '..wwwwwwwwwwwwwwwwwwwww.',
    '..ww..................w.', '..ww......kkkkkk......w.', '..ww......k....k......w.',
    '..wwwwwwwwwwwwwwwwwwwww.', '..ww..................w.', '..ww..kk..........kk..w.',
    '..ww.kkkk.ssssss.kkkk.w.', '..ww..kk..........kk..w.', '..ww..................w.',
    '..ww..................w.', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  bld_board: { p: { w: '#6a4e2c', W: '#8a6a40', p: '#e0d8b8', k: '#3a2a18', g: '#3e6234' }, r: [
    '........................', '........................', '........................',
    '....WWWWWWWWWWWWWWWW....', '....WkkkkkkkkkkkkkkW....', '....WkppppkkppppppkW....',
    '....WkpkppkkpkpkppkW....', '....WkppppkkppppppkW....', '....WkpkppkkpkkkppkW....',
    '....WkppppkkppppppkW....', '....WkkkkkkkkkkkkkkW....', '....WWWWWWWWWWWWWWWW....',
    '.......ww......ww.......', '.......ww......ww.......', '.......ww......ww.......',
    '.......ww......ww.......', '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..',
    '........................', '........................',
  ]},
  wick: { // the Scrivener — ink-stained, spectacles
    p: { h: '#8a8478', f: '#e0c0a0', K: '#1a1410', s: '#c9a24b', r: '#3a4a6a', R: '#4e6288', q: '#d8d0c0' },
    r: [
      '................', '....hhhhhhhh....', '...hhhhhhhhhh...', '..hhffffffffhh..',
      '..hfffffffffhh..', '..hfsKsffsKsfh..', '..hffffffffffh..', '..hffffssffffh..',
      '..hhffffffffhh..', '...hffffffffh...', '...rrrrrrrrrr...', '..rRRRRRRRRRRr..',
      '..rRRqqqqqqRRr..', '.rRRRqqqqqqRRRr.', '.rRRRRRRRRRRRRr.', '................',
    ],
  },
});

/* ---- tiny HUD icons (8x8 / 10x10) ---- */
Object.assign(SPRITES, {
  icon_coin:  { p: { g: '#c9a24b', G: '#f0d080', k: '#6b5426' }, r: ['..gggg..', '.gGGGGg.', 'gGGkkGGg', 'gGkGGkGg', 'gGkGGkGg', 'gGGkkGGg', '.gGGGGg.', '..gggg..'] },
  icon_token: { p: { b: '#4a7a9a', B: '#7ab0d0', k: '#2a4a5e' }, r: ['..bbbb..', '.bBBBBb.', 'bBkkkkBb', 'bBkBBkBb', 'bBkBBkBb', 'bBkkkkBb', '.bBBBBb.', '..bbbb..'] },
  icon_flame: { p: { r: '#e05020', o: '#f08030', y: '#f8d060', w: '#fff8d0' }, r: ['....r.....', '...rr..r..', '..rrr.rr..', '.rrorrrr..', '.rooorrr..', 'rrooyoorr.', 'rooyyyoor.', 'royywyyor.', '.royyyyor.', '..rooor...'] },
  pack: { p: { p: '#7a4a9a', P: '#9a62c0', y: '#e0c060', k: '#2a1a3a', w: '#e8e0d0', z: '#5a3a7a' }, r: [
    'zzzzzzzzzzzz', 'zpppppppppzz', 'pPPPPPPPPPPp', 'pPyPPPPPPyPp', 'pPPPPPPPPPPp',
    'pPPkkkkkkPPp', 'pPPkwwwwkPPp', 'pPPkwkkwkPPp', 'pPPkwkkwkPPp', 'pPPkwwwwkPPp',
    'pPPkkkkkkPPp', 'pPPPPPPPPPPp', 'pPyPPPPPPyPp', 'pPPPPPPPPPPp', 'pPPPPPPPPPPp', 'pppppppppppp',
  ]},
  /* ---- menagerie hats (drawn onto monsters) ---- */
  hat_top:    { p: { k: '#16161e', g: '#c9a24b' }, r: ['..kkkk..', '..kkkk..', '..gggg..', 'kkkkkkkk'] },
  hat_cone:   { p: { r: '#c04050', y: '#f0d060', w: '#e8e0d0' }, r: ['...y....', '...rr...', '..rwrr..', '.rrrrrr.'] },
  hat_crown:  { p: { g: '#e0b040', r: '#c04050' }, r: ['g.g..g.g', 'g.grrg.g', 'gggggggg', '.gggggg.'] },
  hat_flower: { p: { p: '#e070a0', y: '#f0d060', v: '#5a8a48' }, r: ['..pp....', '.pyyp...', '..ppv...', '....v...'] },
  hat_bow:    { p: { r: '#c04050', R: '#e06070' }, r: ['........', 'rr....rr', 'rRr..rRr', '.rrRRrr.'] },
  hat_halo:   { p: { y: '#f0d060' }, r: ['.yyyyyy.', 'y......y', '.yyyyyy.', '........'] },
  hat_wizard: { p: { b: '#4a5ac0', B: '#6a7ae0', y: '#f0d060' }, r: ['...bb...', '..bByb..', '..bBBb..', '.bbbbbb.'] },
  hat_mush:   { p: { r: '#c04040', w: '#e8e0d0' }, r: ['..rrrr..', '.rwrrwr.', 'rrrrwrrr', '.wwwwww.'] },
  /* ---- siege trophies (weekly raid exclusives) ---- */
  hat_horns:      { p: { b: '#d8ccb0', k: '#8a7a58' }, r: ['b......b', 'bb....bb', '.bk..kb.', '.bb..bb.'] },
  hat_skullcrown: { p: { w: '#e8e4d8', k: '#1a1410' }, r: ['w.w..w.w', 'wwwwwwww', 'wkwkkwkw', 'wwwwwwww'] },
  hat_tentacle:   { p: { p: '#9a62c0', s: '#d8a8e8' }, r: ['..pp....', '.ps.p...', '.p..pp..', '..ppsp..'] },
  hat_antlers:    { p: { a: '#8a6a40' }, r: ['a..a.a..', '.a.aa.a.', '.aa..aa.', '..a..a..'] },
  hat_embercrown: { p: { r: '#e05020', o: '#f08030', y: '#f8d060' }, r: ['.y..y..y', '.o.ro.o.', 'roorroor', '.rrrrrr.'] },
  hat_eyestalk:   { p: { g: '#5a8a48', w: '#e8e0d0', k: '#101014' }, r: ['..gwwg..', '..gwkg..', '...gg...', '...gg...'] },
  /* ---- pen decorations ---- */
  decor_flowers: { p: { p: '#e070a0', y: '#f0d060', v: '#3e6234', w: '#e8e0d0' }, r: ['p..w..y.', '.v.v.v..', 'y..p..w.', '.v.v.v..'] },
  decor_boulder: { p: { s: '#6a6a78', S: '#8a8a98' }, r: ['..ssss..', '.sSSSSs.', 'sSSSSSSs', 'ssssssss'] },
  decor_pond: { p: { b: '#3a6a9a', B: '#5a90c0', w: '#8ac0e0' }, r: ['..bbbb..', '.bBBwBb.', 'bBBwBBBb', '.bbbbbb.'] },
  decor_gnome: { p: { r: '#c04050', f: '#e0b088', w: '#e8e0d0', b: '#4a5ac0' }, r: ['...r....', '..rrr...', '..ff....', '..ww....', '..bb....', '..bb....'] },
  maud: { // the Curator — an owl in spectacles
    p: { b: '#6a4e2c', B: '#8a6a40', w: '#e8e0d0', k: '#1a1410', y: '#e0a030', g: '#c9a24b', f: '#c8a878' },
    r: [
      '................', '..bb........bb..', '..bbb......bbb..', '...bbbbbbbbbb...',
      '..bBBBBBBBBBBb..', '..bBgggBBgggBb..', '..bgwwwgBgwwwgb.', '..bgwkwgggwkwgb.',
      '..bgwwwgBgwwwgb.', '..bBgggByBgggBb.', '..bBBBByyyBBBb..', '..bBfBBByBBfBb..',
      '...bffBBBBBff...', '...bBBBBBBBBb...', '....bb.bb.bb....', '................',
    ],
  },
  bld_ranch: { p: { w: '#6a4e2c', W: '#8a6a40', r: '#8a3020', R: '#a84028', g: '#3e6234', G: '#5a8a48', k: '#2a1a10' }, r: [
    '........................', '..........rr............', '.......rrrrrrrrrr.......', '.....rrRRRRRRRRRRrr.....',
    '...rrRRRRRRRRRRRRRRrr...', '...WWWWWWWWWWWWWWWWWW...', '...WwwWWWWkkkkWWWWwwW...', '...WwwWWWWkkkkWWWWwwW...',
    '...WWWWWWWkkkkWWWWWWW...', '...WwwWWWWkkkkWWWWwwW...', '..ww..................ww', '..wwwwwwwwwwwwwwwwwwwwww',
    '..ww..................ww', '..ww..GG......GG......ww', '..wwwwwwwwwwwwwwwwwwwwww', '..ww..GG......GG......ww',
    '..gggggggggggggggggggg..', '.ggggggggggggggggggggg..', '........................', '........................',
  ]},
  bld_colosseum: { p: { s: '#8a7050', S: '#c8a878', k: '#3a2418', g: '#3e6234' }, r: [
    '........................', '........................', '........................',
    '.......ssssssssss.......', '.....sSSSSSSSSSSSSs.....', '...sSSSSSSSSSSSSSSSSs...',
    '.sSkkSSkkSSkkSSkkSSkkSs.', '.sSkkSSkkSSkkSSkkSSkkSs.', '.sSkkSSkkSSkkSSkkSSkkSs.',
    '.sSkkSSkkSSkkSSkkSSkkSs.', '.sSkkSSkkSSkkSSkkSSkkSs.', '.sSSSSSSSSSSSSSSSSSSSSs.',
    '.sSSSSSSSSSSSSSSSSSSSSs.', '.sSSSSSSSSSSSSSSSSSSSSs.', '..gggggggggggggggggggg..',
    '.gggggggggggggggggggggg.', '........................', '........................',
  ]},
});

/* ---- customizable hero: skin / hair style / hair color / shirt / pants ---- */

const HERO_SKINS = ['#f0c8a0', '#d9a066', '#b07040', '#8a5230', '#5c3620', '#8aa05a', '#9a8ab8', '#b8c8d8'];
const HERO_HAIR_STYLES = ['short', 'long', 'spiky', 'ponytail', 'hood', 'bald'];
const HERO_HAIR_COLORS = ['#3a2a1a', '#6a4a2a', '#c8a050', '#a03028', '#101014', '#d8d8e0', '#5a8a48', '#7a5ab8', '#d870a8'];
const HERO_SHIRTS = ['#7a5230', '#4a5ac0', '#7a2828', '#3e6234', '#8a8a98', '#c9a24b', '#5a3a7a', '#2a6a6a', '#c05080', '#3a3a44'];
const HERO_PANTS = ['#3a3040', '#4a3a24', '#2a3a5a', '#4a2222', '#3e4a34', '#6a6a78'];

function drawHero(ctx, ap, scale, ox = 0, oy = 0) {
  const skin = HERO_SKINS[ap.skin % HERO_SKINS.length];
  const style = HERO_HAIR_STYLES[ap.hair % HERO_HAIR_STYLES.length];
  const hair = HERO_HAIR_COLORS[ap.hair_color % HERO_HAIR_COLORS.length];
  const shirt = HERO_SHIRTS[ap.shirt % HERO_SHIRTS.length];
  const pants = HERO_PANTS[ap.pants % HERO_PANTS.length];
  const dark = '#16161e';
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale); };
  const row = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) px(x, y, c); };

  // hair behind/top
  if (style === 'spiky') { px(3, 0, hair); px(5, 0, hair); px(7, 0, hair); px(4, 0, hair === '#101014' ? hair : hair); }
  if (style !== 'bald' && style !== 'hood') { row(1, 4, 7, hair); row(2, 3, 8, hair); }
  if (style === 'hood') { row(0, 4, 7, shirt); row(1, 3, 8, shirt); row(2, 3, 8, shirt); }
  if (style === 'long') { for (let y = 3; y <= 5; y++) { px(2, y, hair); px(9, y, hair); } px(3, 5, hair); px(8, 5, hair); }
  if (style === 'ponytail') { px(9, 2, hair); px(10, 3, hair); px(10, 4, hair); px(10, 5, hair); }
  if (style === 'hood') { for (let y = 3; y <= 5; y++) { px(3, y, shirt); px(8, y, shirt); } }
  if (style === 'bald') { row(2, 4, 7, skin); }

  // face
  row(3, 4, 7, skin); px(4, 3, dark); px(7, 3, dark);       // eyes on brow row edges
  row(4, 4, 7, skin); px(4, 4, skin); px(7, 4, skin);
  px(5, 4, skin); px(6, 4, skin);
  row(5, 4, 7, skin);
  px(5, 5, dark); px(6, 5, dark);                            // small mouth

  // torso
  row(6, 3, 8, shirt);
  row(7, 3, 8, shirt); px(2, 7, shirt); px(9, 7, shirt);     // arms
  row(8, 3, 8, shirt); px(2, 8, skin); px(9, 8, skin);       // hands
  row(9, 3, 8, dark);                                        // belt
  // legs
  row(10, 3, 5, pants); row(10, 6, 8, pants);
  px(3, 11, pants); px(4, 11, pants); px(7, 11, pants); px(8, 11, pants);
  px(3, 12, dark); px(4, 12, dark); px(7, 12, dark); px(8, 12, dark);   // boots
}

function heroTag(ap, pxSize) {
  const scale = Math.max(2, Math.floor(pxSize / 13));
  const csv = [ap.skin, ap.hair, ap.hair_color, ap.shirt, ap.pants].map(v => v || 0).join(',');
  return `<canvas data-hero="${csv}" width="${12 * scale}" height="${13 * scale}" style="width:${12 * scale}px;height:${13 * scale}px;image-rendering:pixelated"></canvas>`;
}

function heroApFromCsv(csv) {
  const [skin, hair, hair_color, shirt, pants] = csv.split(',').map(Number);
  return { skin, hair, hair_color, shirt, pants };
}

/* ---- procedural monsters: DNA seed -> deterministic pixel creature ---- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hsl(h, s, l) { return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%)`; }

function genMonsterModel(dna, rarity) {
  const rnd = mulberry32(dna);
  const W = 12, H = 12, half = W / 2;
  const grid = Array.from({ length: H }, () => Array(W).fill(0));
  // grow a mirrored blob, denser in the middle rows
  for (let y = 2; y < H - 1; y++) {
    const rowBias = 1 - Math.abs(y - (H / 2 + 0.5)) / (H / 2);
    for (let x = 1; x < half; x++) {
      const colBias = x / half;
      if (rnd() < 0.25 + rowBias * 0.5 + colBias * 0.25) {
        grid[y][x] = 1; grid[y][W - 1 - x] = 1;
      }
    }
    if (y >= 4 && y <= 8) { grid[y][half - 1] = 1; grid[y][half] = 1; } // guarantee a torso
  }
  const sat = rarity === 'legendary' ? 85 : 45 + rnd() * 25;
  const h0 = rnd() * 360;
  const body = hsl(h0, sat, 42), dark = hsl(h0, sat, 26);
  const accent = hsl((h0 + 90 + rnd() * 160) % 360, sat, 55);
  // speckle pattern
  const speckle = rnd() < 0.5;
  // eyes: sometimes weird
  const eyeY = 4 + Math.floor(rnd() * 2);
  const style = rnd();
  let eyes;
  if (style < 0.12) eyes = [[half - 0.5, eyeY]];               // one central eye
  else if (style < 0.22) eyes = [[3, eyeY], [half - 0.5, eyeY - 1], [W - 4, eyeY]]; // three
  else eyes = [[3 + Math.floor(rnd() * 1.5), eyeY], [W - 4 - Math.floor(rnd() * 1.5), eyeY]];
  const horns = rnd() < 0.4, ears = !horns && rnd() < 0.4;
  const mouthW = rnd() < 0.7 ? 2 + Math.floor(rnd() * 3) : 0;
  const legs = rnd() < 0.8 ? (rnd() < 0.5 ? 2 : 4) : 0;
  return { grid, W, H, body, dark, accent, speckle, eyes, eyeY, horns, ears, mouthW, legs, dna };
}

function drawMonsterHat(ctx, m, scale, hatKey) {
  const s = SPRITES[hatKey];
  if (!s) return;
  let topY = 0;
  outer: for (let y = 0; y < m.H; y++) {
    for (let x = 3; x < m.W - 3; x++) if (m.grid[y][x]) { topY = y; break outer; }
  }
  const hatH = s.r.length, hatW = s.r[0].length;
  const x0 = Math.floor((m.W - hatW) / 2), y0 = topY - hatH + 1;
  for (let y = 0; y < hatH; y++) {
    for (let x = 0; x < hatW; x++) {
      const col = s.p[s.r[y][x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect((x0 + x) * scale, (y0 + y) * scale, scale, scale);
    }
  }
}

function drawMonster(ctx, m, scale, ox = 0, oy = 0, flip = false, blink = false, hat = null) {
  ctx.save();
  if (flip) { ctx.translate(ox + m.W * scale, oy); ctx.scale(-1, 1); }
  else ctx.translate(ox, oy);
  const rnd = mulberry32(m.dna ^ 0x5EED);
  for (let y = 0; y < m.H; y++) {
    for (let x = 0; x < m.W; x++) {
      if (!m.grid[y][x]) continue;
      ctx.fillStyle = (m.speckle && rnd() < 0.18) ? m.accent : (y > m.H - 4 ? m.dark : m.body);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  // horns / ears above topmost body pixels
  const topAt = (x) => { for (let y = 0; y < m.H; y++) if (m.grid[y][x]) return y; return -1; };
  if (m.horns || m.ears) {
    [3, m.W - 4].forEach(x => {
      const t = topAt(x);
      if (t > 0) {
        ctx.fillStyle = m.horns ? m.accent : m.dark;
        ctx.fillRect(x * scale, (t - 1) * scale, scale, scale);
        if (m.horns) ctx.fillRect(x * scale, (t - 2) * scale, scale, scale);
      }
    });
  }
  // legs
  if (m.legs) {
    const xs = m.legs === 2 ? [4, m.W - 5] : [3, 5, m.W - 6, m.W - 4];
    xs.forEach(x => {
      ctx.fillStyle = m.dark;
      ctx.fillRect(x * scale, (m.H - 1) * scale, scale, scale);
    });
  }
  // eyes + mouth
  if (!blink) {
    m.eyes.forEach(([ex, ey]) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.floor(ex) * scale, ey * scale, scale, scale);
      ctx.fillStyle = '#101014';
      ctx.fillRect(Math.floor(ex) * scale + Math.max(1, scale / 3), ey * scale + Math.max(1, scale / 3), Math.max(1, scale / 3), Math.max(1, scale / 3));
    });
  } else {
    ctx.fillStyle = '#101014';
    m.eyes.forEach(([ex, ey]) => ctx.fillRect(Math.floor(ex) * scale, ey * scale + Math.max(1, scale / 2), scale, Math.max(1, scale / 4)));
  }
  if (m.mouthW) {
    ctx.fillStyle = '#101014';
    ctx.fillRect((Math.floor(m.W / 2) - Math.floor(m.mouthW / 2)) * scale, (m.eyeY + 2) * scale, m.mouthW * scale, Math.max(1, scale / 2));
  }
  if (hat) drawMonsterHat(ctx, m, scale, hat);
  ctx.restore();
}

function monsterTag(dna, rarity, px, hat) {
  const scale = Math.max(2, Math.floor(px / 12));
  // canvas is 12 wide, 18 tall so hats have headroom; monster sits at the bottom
  return `<canvas data-monster="${dna}" data-rarity="${rarity}" ${hat ? `data-hat="${hat}"` : ''} width="${12 * scale}" height="${18 * scale}" style="width:${12 * scale}px;height:${18 * scale}px;image-rendering:pixelated"></canvas>`;
}

/* ---- BOSS creatures: a darker, meaner generator — horns, spikes, tail,
   glowing evil eyes, fanged maw. Used for the Siege and captured bosses. ---- */

const BOSS_W = 14, BOSS_H = 14;

function genBossModel(dna) {
  const rnd = mulberry32((dna ^ 0xB0551) >>> 0);
  const W = BOSS_W, H = BOSS_H, half = W / 2;
  const grid = Array.from({ length: H }, () => Array(W).fill(0));
  // a hulking mirrored body, heavier toward the bottom (hunched, looming)
  for (let y = 3; y < H - 1; y++) {
    const rowBias = (y - 2) / (H - 2);
    for (let x = 1; x < half; x++) {
      const colBias = x / half;
      if (rnd() < 0.32 + rowBias * 0.42 + colBias * 0.2) { grid[y][x] = 1; grid[y][W - 1 - x] = 1; }
    }
    if (y >= 5 && y <= 11) { for (let x = half - 2; x <= half + 1; x++) grid[y][x] = 1; } // solid core
  }
  const evilHues = [0, 348, 312, 280, 258, 110, 22];   // blood, crimson, violet, plum, indigo, bile, ember
  const h0 = (evilHues[Math.floor(rnd() * evilHues.length)] + (rnd() * 16 - 8) + 360) % 360;
  const sat = 50 + rnd() * 28;
  const body = hsl(h0, sat, 20 + rnd() * 6);
  const dark = hsl(h0, sat, 10);
  const accent = hsl((h0 + 24) % 360, sat, 38);
  const eyeColor = [['#ff2a18', '#5a0000'], ['#f5c420', '#4a3000'], ['#8ef028', '#183000'], ['#ff5ac8', '#3a0028']][Math.floor(rnd() * 4)];
  const eyeY = 5 + Math.floor(rnd() * 2);
  return {
    grid, W, H, body, dark, accent, eyeColor, eyeY, dna,
    threeEyes: rnd() < 0.30,
    tail: rnd() < 0.85,
    horn: '#d8ccb0',
  };
}

function drawBoss(ctx, m, scale, ox = 0, oy = 0, flip = false, blink = false) {
  ctx.save();
  if (flip) { ctx.translate(ox + m.W * scale, oy); ctx.scale(-1, 1); } else ctx.translate(ox, oy);
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x * scale, y * scale, scale, scale); };
  const rnd = mulberry32((m.dna ^ 0x13AD7) >>> 0);
  const topAt = (x) => { for (let y = 0; y < m.H; y++) if (m.grid[y][x]) return y; return -1; };
  // body — darker belly, occasional glowing accent flecks
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    if (!m.grid[y][x]) continue;
    px(x, y, rnd() < 0.10 ? m.accent : (y > m.H - 4 ? m.dark : m.body));
  }
  // jagged back spikes along the ridge
  for (let x = 3; x <= m.W - 4; x += 2) {
    const t = topAt(x);
    if (t > 0 && rnd() < 0.85) px(x, t - 1, m.dark);
  }
  // heavy horns curling up-and-out from the shoulders
  const horn = (bx, dir) => {
    const t = Math.max(1, topAt(bx));
    px(bx, t - 1, m.horn); px(bx + dir, t - 2, m.horn); px(bx + 2 * dir, t - 3, m.horn);
  };
  horn(3, -1); horn(m.W - 4, 1);
  // tail lashing out to the side, near the base
  if (m.tail) {
    const ty = m.H - 3;
    px(m.W - 1, ty, m.dark); px(m.W - 1, ty - 1, m.dark); px(m.W - 2, ty, m.body);
    px(m.W - 1, ty - 2, m.accent);
  }
  // clawed feet
  [3, 5, m.W - 6, m.W - 4].forEach(x => px(x, m.H - 1, m.dark));
  // evil eyes — a glowing block with an angled brow slash, angrier toward center
  const eyes = m.threeEyes
    ? [[3, m.eyeY, 1], [Math.floor(m.W / 2) - 1, m.eyeY - 1, 0], [m.W - 4, m.eyeY, -1]]
    : [[3, m.eyeY, 1], [m.W - 4, m.eyeY, -1]];
  eyes.forEach(([ex, ey, dir]) => {
    if (blink) { px(ex, ey + 1, m.dark); return; }
    px(ex, ey, m.eyeColor[0]);                       // glowing eye
    if (scale >= 5) {                                // dark slit pupil at larger sizes
      ctx.fillStyle = m.eyeColor[1];
      const p = Math.max(1, Math.floor(scale / 3));
      ctx.fillRect(ex * scale + Math.floor(scale / 2) - Math.floor(p / 2), ey * scale + Math.floor(scale / 3), p, scale - Math.floor(scale / 3));
    }
    px(ex - dir, ey - 1, m.dark);                    // angry brow, tilted inward
  });
  // fanged maw
  const cx = Math.floor(m.W / 2), my = m.eyeY + 3;
  for (let x = cx - 2; x <= cx + 1; x++) px(x, my, m.dark);
  px(cx - 1, my + 1, '#e8e0d0'); px(cx, my + 1, '#e8e0d0');   // fangs
  ctx.restore();
}

function bossTag(dna, px) {
  const scale = Math.max(2, Math.floor(px / BOSS_W));
  const w = BOSS_W * scale, h = (BOSS_H + 2) * scale;   // headroom for horns
  return `<canvas data-boss="${dna}" width="${w}" height="${h}" style="width:${w}px;height:${h}px;image-rendering:pixelated"></canvas>`;
}

/* pick the right renderer for a creature record (boss creatures look meaner) */
function critterTag(m, px) {
  return m && m.boss ? bossTag(m.dna, px) : monsterTag(m.dna, m.rarity, px, m && m.hat);
}

/* ---- body map: front & back figures, pixels tagged by muscle group ---- */
const BODY_FRONT = [
  '....hhhh....', '....hhhh....', '.....hh.....', '..ssccccss..', '.assccccssa.',
  '.aaccccccaa.', '.aa.cccc.aa.', '.aa.oooo.aa.', '.aa.oooo.aa.', '..a.oooo.a..',
  '..a.oooo.a..', '....llll....', '....llll....', '....llll....', '....llll....',
  '....ll.ll...', '....ll.ll...', '....ll.ll...', '....ll.ll...', '....ll.ll...',
];
const BODY_BACK = [
  '....hhhh....', '....hhhh....', '.....hh.....', '..ssbbbbss..', '.assbbbbssa.',
  '.aabbbbbbaa.', '.aa.bbbb.aa.', '.aa.bbbb.aa.', '.aa.bbbb.aa.', '..a.pppp.a..',
  '..a.pppp.a..', '....pppp....', '....pppp....', '....pppp....', '....pppp....',
  '....pp.pp...', '....pp.pp...', '....ll.ll...', '....ll.ll...', '....ll.ll...',
];
const BODY_GROUPS = { c: 'chest', o: 'core', s: 'shoulders', a: 'arms', l: 'legs', b: 'back', p: 'posterior' };

function drawBodyMap(canvas, groups) {
  const ctx = canvas.getContext('2d');
  const scale = Math.floor(canvas.width / 26) || 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const paint = (rows, ox) => {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        const g = BODY_GROUPS[ch];
        ctx.fillStyle = g && groups.includes(g) ? '#e0a030' : (ch === 'h' ? '#3c3c50' : '#2c2c3e');
        ctx.fillRect((ox + x) * scale, y * scale, scale, scale);
      });
    });
  };
  paint(BODY_FRONT, 0);
  paint(BODY_BACK, 14);
}

function bodyMapTag(groups, px) {
  const w = 26, h = 20;
  const scale = Math.max(1, Math.floor(px / w));
  return `<canvas data-bodymap="${groups.join(',')}" width="${w * scale}" height="${h * scale}" style="width:${w * scale}px;height:${h * scale}px;image-rendering:pixelated"></canvas>`;
}

function drawSprite(canvas, key) {
  const s = SPRITES[key];
  if (!s || !canvas) return;
  const rows = s.r, h = rows.length, w = rows[0].length;
  const scale = Math.floor(canvas.width / w) || 1;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = s.p[rows[y][x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

function spriteTag(key, px) {
  const s = SPRITES[key];
  const w = s ? s.r[0].length : 16;
  const h = s ? s.r.length : 16;
  const scale = Math.max(1, Math.floor(px / w));
  return `<canvas data-sprite="${key}" width="${w * scale}" height="${h * scale}" style="width:${w * scale}px;height:${h * scale}px;image-rendering:pixelated"></canvas>`;
}

function hydrateSprites(root) {
  (root || document).querySelectorAll('canvas[data-sprite]').forEach(c => drawSprite(c, c.dataset.sprite));
  (root || document).querySelectorAll('canvas[data-bodymap]').forEach(c =>
    drawBodyMap(c, c.dataset.bodymap ? c.dataset.bodymap.split(',') : []));
  (root || document).querySelectorAll('canvas[data-hero]').forEach(c => {
    drawHero(c.getContext('2d'), heroApFromCsv(c.dataset.hero), Math.floor(c.width / 12));
  });
  (root || document).querySelectorAll('canvas[data-monster]').forEach(c => {
    const m = genMonsterModel(parseInt(c.dataset.monster), c.dataset.rarity);
    const scale = Math.floor(c.width / 12);
    drawMonster(c.getContext('2d'), m, scale, 0, c.height - 12 * scale, false, false, c.dataset.hat || null);
  });
  (root || document).querySelectorAll('canvas[data-boss]').forEach(c => {
    const m = genBossModel(parseInt(c.dataset.boss));
    const scale = Math.floor(c.width / BOSS_W);
    drawBoss(c.getContext('2d'), m, scale, 0, c.height - BOSS_H * scale, false, false);
  });
}
