/* All town screens. Dungeon lives in dungeon.js. */
const SCREENS = {};

const GREETINGS = {
  running: [
    'The roads remember every step. They have been asking after you.',
    'Wind at your back today, friend. A shame to waste it.',
    'I ran these hills before your grandmother was born. Your turn.',
  ],
  kettlebell: [
    'The bell does not care how you feel. Lift it anyway.',
    'My grandmother forged these. She could swing two. Just saying.',
    'Iron is honest, friend. It weighs what it weighs.',
  ],
  strength: [
    'A knight is measured by what they can carry. Shall we measure you?',
    'The barbell is a dragon that lies very still. Slay it in sets.',
    'Heavy is the head... and the deadlift. Mostly the deadlift.',
  ],
  mobility: [
    'You cannot pour from a torn hamstring, dear. Sit. Breathe.',
    'The willow bends and does not break. Be the willow.',
    'Rest is also training. The impatient learn this the painful way.',
  ],
  wick: [
    'Ah. Come to confess a deed, or to have one struck from the record?',
    'The ledger is patient, but it does prefer the truth.',
    'Ink dries. Sweat, regrettably, does not file itself.',
  ],
};

/* NPC reactions to your choices — spoken in the dialog box, not toasted */
const REACTIONS = {
  accept: {
    running: ['Good. The road is already listening for your footsteps.', 'Sworn, then. Do not keep the miles waiting.'],
    kettlebell: ['HA! The bell approves. Go introduce yourselves.', 'Sworn on iron. My grandmother is watching, probably.'],
    strength: ['A worthy oath. The plates await your argument.', 'So sworn. Carry it well.'],
    mobility: ['Wise. The body thanks you in advance, quietly.', 'Good. Slowness is also a discipline.'],
  },
  complete: {
    running: ['You reek of effort. Wonderful. The road speaks highly of you.', 'Back already? The miles yield to you, runner.'],
    kettlebell: ['LOOK AT YOU. The bell sings your name — off-key, but it sings.', 'Done and done. The iron remembers the honest ones.'],
    strength: ['The load was borne. You stand taller for it, I see it.', 'Well carried. Even the barbell seems impressed, and it hates everyone.'],
    mobility: ['See? Softer already. The willow nods to you.', 'The debt is settled. Your joints whisper their thanks.'],
  },
  abandon: {
    running: ['Hmph. The road forgives. The road also remembers.', 'A quest set down is heavier than one carried. Off with you.'],
    kettlebell: ['You WHAT? ...Fine. The bell will wait. Bells are patient. I am not.', 'Grandmother saw that. From beyond. She is disappointed.'],
    strength: ['Setting down a burden is sometimes wisdom. Sometimes. Not always.', 'The oath is released. Do not make a habit of it.'],
    mobility: ['No shame in it, dear. Come back when the body agrees.', 'Even rivers change course. Go gently.'],
  },
  reroll: {
    running: ['Picky, are we? Very well — other roads exist.', 'Ten gold to reshuffle fate. The road shrugs.'],
    kettlebell: ['Not iron enough for you? Let me dig deeper in the pile.', 'Coin for choices. Grandmother would approve of the haggling.'],
    strength: ['The lady or the lord demands variety. As you wish.', 'Very well — different burdens, same gravity.'],
    mobility: ['Of course. The body wants what it wants.', 'Let us find a gentler shape for the day.'],
  },
};

/* word travels: every NPC congratulates a fresh quest completion */
const CONGRATS = {
  running: ['Word reached me of "{q}". Well run, friend. The roads gossip.', 'Ah, the hero of "{q}"! Fenn tips his hood.'],
  kettlebell: ['I heard about "{q}". The forge rang twice in your honor.', '"{q}", was it? HA! Grandmother would have liked you.'],
  strength: ['News of "{q}" reached the keep. A knight notices these things.', 'So you carried "{q}" to the end. Well borne.'],
  mobility: ['The willow whispered of "{q}". Gently done, dear.', 'I felt the calm of "{q}" from across the square. Well done.'],
  wick: ['"{q}" — yes, yes, already inked. Fine work. The ledger smiled, briefly.', 'I recorded "{q}" this very hour. Neat margins. Neater deed.'],
};

const GIVER_ROLES = {
  running: 'Quests of the Road',
  kettlebell: 'Quests of the Bell',
  strength: 'Quests of Iron',
  mobility: 'Quests of Stillness',
};

/* Fenn's quip when his speech bubble pops out of the waystone for an
   unguided-run bonus — the fuller "note" line lives server-side in
   game.UNGUIDED_RUN_NOTES and shows in the ceremony that follows. */
const FENN_BUBBLE_LINES = [
  'Psst. I saw that run. You didn\u2019t even ask me first.',
  'Ran off without a word to me, did you? Rude. Here \u2014 take this anyway.',
  'The road tattled on you. Good thing I don\u2019t hold grudges as long as I hold coin.',
];

const CAT_LABELS = {
  run: 'run', ride: 'ride', climb: 'climb', strength: 'lift',
  mobility: 'mobility', walk: 'walk/hike', swim: 'swim', other: 'other',
};

function pickLine(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---- fresh-completion tracking for congratulations ---- */
function lastQuestDone() {
  try {
    const q = JSON.parse(localStorage.getItem('iv_lastq') || 'null');
    if (q && Date.now() - q.ts < 12 * 3600 * 1000) return q;
  } catch (e) { /* ignore */ }
  return null;
}

function recordQuestDone(title, giver) {
  // the giver's own 'complete' reaction is their thanks — they shouldn't later
  // congratulate you for their own quest like a stranger reading the gazette
  const thanked = giver ? { [giver]: true } : {};
  localStorage.setItem('iv_lastq', JSON.stringify({ title, ts: Date.now(), thanked }));
}

function congratLine(npcKey) {
  const q = lastQuestDone();
  if (!q || q.thanked[npcKey]) return null;
  q.thanked[npcKey] = true;
  localStorage.setItem('iv_lastq', JSON.stringify(q));
  return pickLine(CONGRATS[npcKey]).replace('{q}', q.title);
}

/* ================= TOWN ================= */

SCREENS.town = async function () {
  const st = S.state;
  const c = st.character;
  let siege = null;
  try { siege = await api('/raid'); } catch (e) { /* the walls hold without us */ }
  const activeBy = {};
  st.active_quests.forEach(q => activeBy[q.giver] = q);
  const bld = (sprite, name, sub, target, badge = false, px = 120, id = '') => `
    <div class="bld"${id ? ` id="${id}"` : ''} onclick="${target}">
      ${badge ? '<span class="bang">!</span>' : ''}
      ${spriteTag(sprite, px)}
      <span class="plate">${name}<small>${sub}</small></span>
    </div>`;
  const g = st.givers;

  const questRow = (q) => `<div class="offer" style="margin:8px 0">
    <div><span class="o-title" style="font-size:20px">${esc(q.title)}</span>
      <span class="muted">— ${esc(st.givers[q.giver].name)}</span></div>
    <div class="${q.completable ? '' : 'muted'}" style="font-size:17px">${q.completable ? '&#10004; ' : ''}${esc(q.progress_note)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
      ${q.completable ? `<button class="btn small green" style="min-width:0" onclick="G.complete(${q.id}, false)">TURN IN</button>` : ''}
      <button class="btn small" style="min-width:0" onclick="nav('giver',{giver:'${q.giver}'})">visit ${esc(st.givers[q.giver].name)}</button>
      ${['kettlebell', 'strength'].includes(q.giver) ? `<button class="btn small" style="min-width:0" onclick="nav('logger',{quest:${q.id}})">log sets</button>` : ''}
      <button class="btn small danger" style="min-width:0" onclick="G.abandonQuick(${q.id})">abandon</button>
    </div>
  </div>`;

  const siegeBanner = siege ? siegeBannerHtml(siege) : '';

  $app().innerHTML = shell(`
    ${siegeBanner}
    ${st.active_quests.length ? `<div class="win tight"><span class="win-title">Sworn Quests</span>
      ${st.active_quests.map(questRow).join('')}
    </div>` : ''}
    <div class="town-scene">
      <div class="trow">
        ${bld('bld_waystone', esc(g.running.name), GIVER_ROLES.running, `nav('giver',{giver:'running'})`, !!activeBy.running, 120, 'bld-fenn')}
        ${bld('bld_forge', esc(g.kettlebell.name), GIVER_ROLES.kettlebell, `nav('giver',{giver:'kettlebell'})`, !!activeBy.kettlebell)}
        ${bld('bld_keep', esc(g.strength.name), GIVER_ROLES.strength, `nav('giver',{giver:'strength'})`, !!activeBy.strength)}
        ${bld('bld_willow', esc(g.mobility.name), GIVER_ROLES.mobility, `nav('giver',{giver:'mobility'})`, !!activeBy.mobility)}
      </div>
      <div class="road-h"></div>
      <div class="trow">
        ${bld('bld_ledger', 'The Ledger House', 'Wick: confess & amend', `nav('scrivener')`)}
        ${bld('bld_hall', 'Hall of Records', 'stats, vitals & the Curator', `nav('stats')`)}
        ${bld('krank', 'The Krankwerk', 'hats for the herd', `nav('krank')`)}
      </div>
      <div class="road-h"></div>
      <div class="trow">
        ${bld('bld_ranch', 'The Menagerie', 'your creatures graze here', `nav('ranch')`)}
        ${bld('bld_colosseum', 'The Colosseum', 'duels, races &amp; pageants', `nav('colosseum')`)}
        ${bld('bld_gate', 'The Undercroft', st.dungeon_active ? 'expedition below!' : `descend — floor ${st.resume_floor}`, `nav('undercroft')`, st.dungeon_active)}
      </div>
    </div>
  `);
};

/* ---- Fenn's unguided-run bubble: pops out of the waystone (bld-fenn). The
   reward is NOT granted until this is actually tapped — see G.claimFennBubble,
   which hits /api/unguided/claim. S.fennQueue is a straight mirror of the
   server's current unclaimed-today list (see queueFennBubbles in app.js), so
   we reconcile against its head rather than blindly inserting: if a bubble
   is already showing but no longer matches (claimed elsewhere, or quietly
   auto-resolved by the server after a day passed), swap it out. ---- */
function showFennBubbleIfQueued() {
  const next = S.fennQueue && S.fennQueue[0];
  const shown = document.querySelector('.fenn-bubble-wrap');
  if (shown) {
    if (next && shown.dataset.activityId === String(next.activity_id)) return; // already correct
    shown.remove();
  }
  if (!next) return;
  const anchor = document.getElementById('bld-fenn');
  if (!anchor) return;
  anchor.insertAdjacentHTML('beforeend', `
    <div class="fenn-bubble-wrap" data-activity-id="${esc(next.activity_id)}">
      <div class="fenn-bubble" onclick="event.stopPropagation();G.claimFennBubble()">
        <div class="fb-line">&ldquo;${esc(pickLine(FENN_BUBBLE_LINES))}&rdquo;</div>
        <div class="fb-rewards">
          <span style="color:var(--purple)">+${next.xp} XP</span>
          <span class="g">&#9670; +${next.gold}</span>
          <span style="color:var(--green)">+${next.vigor} vigor</span>
        </div>
        <button class="btn small green">FENN LEFT THIS FOR YOU</button>
      </div>
    </div>`);
  SFX.coin();
}

G.claimFennBubble = async () => {
  const b = S.fennQueue && S.fennQueue[0];
  if (!b) return;
  document.querySelectorAll('.fenn-bubble-wrap').forEach(x => x.remove());
  const rewards = await api('/unguided/claim', { method: 'POST', body: { activity_id: b.activity_id } });
  await refreshState();
  render();
  showCeremony(rewards, `An Unguided Run \u2014 ${b.minutes} min`);
};

/* ---- the siege banner: a small breathing preview by default; expands into a
   D&D-style monster card (no health bar) with an expandable war-party board ---- */

const SIEGE = { collapsed: true, leaderOpen: {} };

function siegeBannerHtml(siege) {
  const pct = Math.max(0, Math.round(100 * siege.hp_left / siege.hp_max));
  const hpBar = `<div class="hpbar sg-hp"><div style="width:${pct}%"></div><span>${siege.hp_left} / ${siege.hp_max}</span></div>`;

  // COLLAPSED (default): just the beast breathing + a slim health bar
  if (SIEGE.collapsed) {
    return `<div class="siege-banner collapsed ${siege.defeated ? 'won' : ''}" onclick="G.siegeToggle()" title="expand the siege">
      <div class="sg-boss breathing">${bossTag(siege.dna, 44)}</div>
      <div class="sg-mini">
        <div class="sg-mini-name"><span class="r-legendary">${esc(siege.name)}</span> <span class="muted">${esc(siege.epithet)}</span></div>
        ${siege.defeated ? '<div class="sg-sub" style="color:var(--green)">FELLED — the town holds &middot; tap for spoils</div>' : hpBar}
      </div>
    </div>`;
  }

  // EXPANDED: the monster card — no health bar, just the stat block
  const trophyName = (S.itemsCatalog[siege.trophy] || {}).name || siege.trophy;
  const statLine = siege.defeated
    ? `<span style="color:var(--green)">FELLED — the town held</span>`
    : `<b style="color:var(--gold-bright)">${siege.dealt.toLocaleString()}</b> / ${siege.hp_max.toLocaleString()} damage dealt &middot; falls ${siege.days_left > 0 ? `in ${siege.days_left}d ${siege.hours_left % 24}h` : `in ${siege.hours_left}h`}`;

  const board = siege.contributors.length
    ? siege.contributors.map((x, i) => {
      const open = SIEGE.leaderOpen[x.name];
      const blows = (x.blows || []).map(b =>
        `<div class="sg-blow"><span class="sg-blow-dmg">+${b.dmg}</span> ${esc(b.label)} <span class="muted">${b.ts.slice(5, 16).replace('T', ' ')}</span></div>`
      ).join('') || '<div class="muted" style="font-size:14px">no blows recorded</div>';
      return `<div class="sg-leader ${open ? 'open' : ''}">
        <div class="sg-leader-row" onclick="event.stopPropagation();G.siegeLeader('${esc(x.name).replace(/'/g, '')}')">
          <span class="sg-rank">${i + 1}</span>
          <span class="sg-leader-name">${esc(x.name)}${x.you ? ' <span class="muted">(you)</span>' : ''}</span>
          <span class="sg-leader-dmg">${x.damage.toLocaleString()}</span>
          <span class="sg-leader-caret">${open ? '&#9662;' : '&#9656;'}</span>
        </div>
        ${open ? `<div class="sg-blows" onclick="event.stopPropagation()">${blows}</div>` : ''}
      </div>`;
    }).join('')
    : '<div class="muted center" style="padding:6px">no blows struck yet — be the first to draw its ire</div>';

  return `<div class="siege-banner expanded ${siege.defeated ? 'won' : ''}" onclick="G.siegeToggle()" title="collapse the siege">
    <div class="sg-boss-col">
      <div class="sg-boss-frame">
        <div class="sg-boss breathing">${bossTag(siege.dna, 124)}</div>
      </div>
    </div>
    <div class="sg-content">
      <div class="sg-card-title">
        <div class="sg-name r-legendary">${esc(siege.name)}</div>
        <div class="sg-epithet">${esc(siege.epithet)}</div>
        <div class="sg-meta">SIEGE &middot; Week ${siege.week_num} &middot; began ${esc(siege.started)}</div>
      </div>
      <div class="sg-desc">${esc(siege.description)}</div>
      <div class="sg-statline">${statLine}</div>
      <div class="sg-trophy">TROPHY FOR ALL WHO FELL IT: <span class="r-legendary">${spriteTag((S.itemsCatalog[siege.trophy] || {}).sprite || 'hat_horns', 20)} ${esc(trophyName)}</span></div>
      ${siege.defeated && !siege.claimed ? `<div class="center" style="margin:8px 0"><button class="btn green" onclick="event.stopPropagation();G.raidClaim()">CLAIM YOUR SPOILS</button></div>` : ''}
      ${siege.defeated && siege.claimed ? '<div class="sg-sub muted center" style="margin:6px 0">spoils claimed &#10004; &middot; a new horror comes Monday</div>' : ''}
    </div>
    <div class="sg-divider"><span>&#9670; &#9670; &#9670;</span></div>
    <div class="sg-warparty">
      <div class="sg-board-title">THE WAR PARTY <span class="muted" style="font-size:13px">&mdash; tap a name for their blows</span></div>
      <div class="sg-board">${board}</div>
      <div class="muted" style="font-size:13px;margin-top:6px">1 active minute = 10 damage &middot; every adventurer's workouts count</div>
    </div>
  </div>`;
}

G.siegeToggle = () => {
  SIEGE.collapsed = !SIEGE.collapsed;
  SFX.click();
  render();
};

G.siegeLeader = (name) => {
  SIEGE.leaderOpen[name] = !SIEGE.leaderOpen[name];
  SFX.click();
  render();
};

G.raidClaim = async () => {
  let r;
  try {
    r = await api('/raid/claim', { method: 'POST' });
  } catch (e) { return; }
  await refreshState();
  SFX.fanfare();
  const cap = r.captured;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="win ceremony">
    <h2>SPOILS OF THE SIEGE</h2>
    <div style="margin:12px auto;display:flex;justify-content:center">${spriteTag(r.trophy.sprite, 72)}</div>
    <div class="r-legendary" style="font-size:26px">${esc(r.trophy.name)}</div>
    <div class="muted" style="font-size:16px">${esc(r.trophy.desc)}</div>
    <div class="reward-line" style="margin-top:10px">+ a Monster Pack</div>
    <div class="reward-line" style="color:var(--blue)">&#9678; + ${r.tokens} brass tokens</div>
    ${cap ? `<div class="sg-capture">
      <div style="display:flex;justify-content:center;margin:6px 0">${bossTag(cap.dna, 84)}</div>
      <div class="r-legendary" style="font-size:20px">${esc(cap.name)} YIELDS</div>
      <div class="muted" style="font-size:15px">it did not die — it follows you home. A siege beast joins your Menagerie.</div>
    </div>` : ''}
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn big" style="width:auto" onclick="this.closest('.overlay').remove();nav('ranch')">TO THE MENAGERIE</button>
      <button class="btn" onclick="this.closest('.overlay').remove();render()">GLORY</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  hydrateSprites(ov);
  if (cap) { document.body.classList.add('megashake'); setTimeout(() => document.body.classList.remove('megashake'), 700); }
};

G.abandonQuick = async (id) => {
  if (!confirm('Abandon this quest? The Vale forgives; the ledger remembers.')) return;
  await api(`/quests/${id}/abandon`, { method: 'POST' });
  await refreshState();
  toast('The oath is released.');
  render();
};

G.syncNow = async () => {
  toast('Ravens away...');
  const r = await api('/sync', { method: 'POST' });
  await refreshState();
  render();
  if (r.completed && r.completed.length) {
    r.completed.forEach((q, i) => {
      recordQuestDone(q.title, q.giver);
      setTimeout(() => showCeremony(q.rewards, q.title), i * 400);
    });
  } else if (r.raid_damage) {
    toast(`${r.new_activities} new deed(s) — you strike the siege for ${r.raid_damage}!`);
  } else {
    toast(`${r.new_activities} new deed(s) returned.`);
  }
};

/* ================= QUEST GIVER ================= */

SCREENS.giver = async function () {
  const key = S.params.giver;
  const g = S.state.givers[key];
  const data = await api(`/offers/${key}`);
  let line;
  if (S.params.react) line = pickLine(REACTIONS[S.params.react][key]);
  else line = congratLine(key) || pickLine(GREETINGS[key]);
  const isLiftGiver = ['kettlebell', 'strength'].includes(key);

  const rewardsLine = (o) => `<div class="o-rewards">reward: <b>+${o.xp} XP</b> &middot; <span class="g">&#9670;${o.gold}+</span> &middot; +${o.vigor} vigor${o.bonus_vigor ? ' (+1 bonus)' : ''}</div>`;

  const offerCard = (o) => {
    const routine = o.routine ? `<div class="o-struct">${o.routine.map(r =>
      `&#9656; ${esc(r.exercise)} — ${r.sets}&times;${r.reps}${r.unit === 'seconds' ? 's' : r.unit === 'steps' ? ' steps' : ''}${r.suggest_weight ? ` @ ${r.suggest_weight}` : ''}`
    ).join('<br>')}</div>` : '';
    return `<div class="offer">
      <div><span class="o-title">${esc(o.title)}</span>
        ${o.program ? '<span class="chip program">DOCTRINE</span>' : ''}
        <span class="chip ${o.intensity}">${o.intensity}</span>
        ${o.target_minutes ? `<span class="o-kind">~${o.target_minutes} min</span>` : ''}</div>
      <div class="muted" style="font-size:18px">&ldquo;${esc(o.blurb)}&rdquo;</div>
      <div class="o-struct">${esc(o.structure)}</div>
      ${routine}
      ${o.focus ? `<div style="margin:4px 0">${bodyMapTag(o.focus, 78)}</div>` : ''}
      ${rewardsLine(o)}
      <button class="btn green" onclick="G.accept('${key}',${o.offer_id})">ACCEPT QUEST</button>
    </div>`;
  };

  let body;
  if (data.active) {
    const q = data.active;
    body = `<div class="win"><span class="win-title">Your Sworn Quest</span>
      <div class="offer">
        <div><span class="o-title">${esc(q.title)}</span> <span class="chip ${q.details.intensity}">${q.details.intensity}</span></div>
        <div class="o-struct">${esc(q.details.structure)}</div>
        ${q.details.routine ? `<div class="o-struct">${q.details.routine.map(r =>
          `&#9656; ${esc(r.exercise)} — ${r.sets}&times;${r.reps}${r.suggest_weight ? ` @ ${r.suggest_weight}` : ''}`).join('<br>')}</div>` : ''}
        ${rewardsLine(q.details)}
        <div class="${q.completable ? '' : 'muted'}" style="margin:6px 0">${q.completable ? '&#10004; ' : ''}${esc(q.progress_note)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isLiftGiver ? `<button class="btn" onclick="nav('logger',{quest:${q.id}})">OPEN TRAINING LOG</button>` : ''}
          ${q.giver === 'running' ? `<button class="btn" onclick="G.syncThenBack('${key}')">SYNC RUNS</button>` : ''}
          ${q.completable
            ? `<button class="btn green" onclick="G.complete(${q.id}, false)">TURN IN QUEST</button>`
            : `<button class="btn" onclick="G.completeHonor(${q.id})">COMPLETE ON HONOR</button>`}
          <button class="btn danger small" style="min-width:0" onclick="G.abandon(${q.id}, '${key}')">abandon</button>
        </div>
      </div>
    </div>`;
  } else {
    body = `<div class="win"><span class="win-title">Quests Offered Today</span>
      ${data.offers.map(offerCard).join('')}
      <div class="center" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn small" style="min-width:0" onclick="G.reroll('${key}')">ask for different work (&#9670;10)</button>
        ${isLiftGiver ? `<button class="btn small" style="min-width:0" onclick="nav('doctrines',{giver:'${key}'})">DOCTRINES &amp; ROUTINES</button>` : ''}
      </div>
    </div>`;
  }

  $app().innerHTML = shell(`
    <div class="win">
      <div class="npc-head">
        ${spriteTag(g.sprite, 128)}
        <div class="dialog"><div class="npc-name">${esc(g.name)} ${esc(g.title)}</div><div id="dlg"></div></div>
      </div>
    </div>
    ${body}
  `);
  typewrite(document.getElementById('dlg'), line);
};

G.accept = async (giver, offerId) => {
  await api('/quests/accept', { method: 'POST', body: { giver, offer_id: offerId } });
  SFX.accept();
  await refreshState();
  S.params = { giver, react: 'accept' };
  render();
};

G.reroll = async (giver) => {
  await api(`/offers/${giver}?reroll=true`);
  await refreshState();
  S.params = { giver, react: 'reroll' };
  render();
};

G.abandon = async (id, giver) => {
  if (!confirm('Abandon this quest? The Vale forgives; the ledger remembers.')) return;
  await api(`/quests/${id}/abandon`, { method: 'POST' });
  await refreshState();
  S.params = { giver, react: 'abandon' };
  render();
};

/* NOTE: handlers take only the quest id — titles contain apostrophes that
   detonate inside inline onclick strings ("The Courier's Route", RIP). */
G.complete = async (id, honor) => {
  const q = S.state.active_quests.find(x => x.id === id);
  const title = q ? q.title : 'A Deed';
  const giver = q ? q.giver : null;
  const r = await api(`/quests/${id}/complete`, { method: 'POST', body: { honor } });
  await refreshState();
  recordQuestDone(title, giver);
  if (giver && S.screen === 'giver') S.params = { giver, react: 'complete' };
  render();
  showCeremony(r.rewards, title);
};

G.completeHonor = (id) => {
  if (confirm('No matching record found. Swear on your honor that the deed is done?')) {
    G.complete(id, true);
  }
};

G.syncThenBack = async (giver) => {
  toast('Ravens away...');
  const r = await api('/sync', { method: 'POST' });
  await refreshState();
  if (r.completed && r.completed.length) {
    S.params = { giver, react: 'complete' };
    render();
    r.completed.forEach((q, i) => {
      recordQuestDone(q.title, q.giver);
      setTimeout(() => showCeremony(q.rewards, q.title), i * 400);
    });
  } else {
    S.params = { giver };
    render();
  }
};

/* ================= DOCTRINES (programs & routines) ================= */

const RB = { exercises: [] }; // routine builder state

SCREENS.doctrines = async function () {
  const giver = S.params.giver;
  const d = await api('/programs');
  const active = d.active[giver];
  const progs = d.programs.filter(p => p.giver === giver);
  const routines = d.routines.filter(r => r.giver === giver);
  const giverExs = S.exercises.filter(e =>
    giver === 'kettlebell' ? e.equipment === 'kettlebell' : e.equipment !== 'kettlebell');

  const progCard = (p) => `<div class="prog-card ${active === p.key ? 'active' : ''}">
    <div class="p-name">${esc(p.name)} ${active === p.key ? '<span class="chip program">SWORN</span>' : ''}</div>
    <div class="muted" style="font-size:18px">${esc(p.desc)}</div>
    <div class="o-struct">${p.sessions.map(s =>
      `&#9656; <b style="color:var(--blue)">${esc(s.label)}</b>: ${s.exercises.map(e => `${esc(e[0])} ${e[1]}&times;${e[2]}`).join(', ')}`
    ).join('<br>')}</div>
    ${active === p.key
      ? `<button class="btn danger small" style="min-width:0" onclick="G.selectProgram('${giver}', null)">RENOUNCE</button>`
      : `<button class="btn green" onclick="G.selectProgram('${giver}', '${p.key}')">SWEAR TO IT</button>`}
  </div>`;

  const routineCard = (r) => `<div class="prog-card ${active === 'custom:' + r.id ? 'active' : ''}">
    <div class="p-name">${esc(r.name)} ${active === 'custom:' + r.id ? '<span class="chip program">SWORN</span>' : ''}</div>
    <div class="o-struct">${r.exercises.map(e => `&#9656; ${esc(e.exercise)} ${e.sets}&times;${e.reps}`).join('<br>')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${active === 'custom:' + r.id
      ? `<button class="btn danger small" style="min-width:0" onclick="G.selectProgram('${giver}', null)">RENOUNCE</button>`
      : `<button class="btn green small" style="min-width:0" onclick="G.selectProgram('${giver}', 'custom:${r.id}')">SWEAR TO IT</button>`}
    <button class="btn danger small" style="min-width:0" onclick="G.deleteRoutine('${r.id}','${giver}')">burn it</button>
    </div>
  </div>`;

  $app().innerHTML = shell(`
    <div class="win"><span class="win-title">Doctrines of ${esc(S.state.givers[giver].name)}</span>
      <div class="muted" style="margin-bottom:6px">Swear to a doctrine and its next session leads the day's offers,
        weights progressing as you complete them.</div>
      ${progs.map(progCard).join('')}
    </div>
    <div class="win"><span class="win-title">Your Own Routines</span>
      ${routines.map(routineCard).join('') || '<div class="muted">None yet. Forge one below.</div>'}
      <hr class="rule">
      <div class="formrow"><label>routine name</label><input type="text" id="rb-name" placeholder="e.g. Push Day"></div>
      <div class="formrow"><label>add exercise</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select id="rb-ex" style="flex:1;min-width:160px">${giverExs.map(e => `<option>${esc(e.name)}</option>`).join('')}</select>
          <input type="number" id="rb-sets" value="3" style="width:64px" title="sets">
          <span class="muted">&times;</span>
          <input type="number" id="rb-reps" value="8" style="width:64px" title="reps">
          <button class="btn small" style="min-width:0" onclick="G.rbAdd()">ADD</button>
        </div>
      </div>
      <div id="rb-list" class="loglist">${RB.exercises.map((e, i) =>
        `<div><b>${esc(e.exercise)}</b> ${e.sets}&times;${e.reps}
         <button class="btn small danger" style="min-width:0;padding:0 8px" onclick="G.rbRemove(${i})">x</button></div>`).join('')}</div>
      <button class="btn green" style="margin-top:8px" onclick="G.rbSave('${giver}')">FORGE ROUTINE</button>
    </div>
  `);
};

G.selectProgram = async (giver, key) => {
  await api('/programs/select', { method: 'POST', body: { giver, key } });
  SFX.accept();
  toast(key ? 'Sworn. The doctrine leads your offers now.' : 'Doctrine renounced.');
  render();
};

G.rbAdd = () => {
  RB.exercises.push({
    exercise: document.getElementById('rb-ex').value,
    sets: parseInt(document.getElementById('rb-sets').value) || 3,
    reps: parseInt(document.getElementById('rb-reps').value) || 8,
  });
  RB.name = document.getElementById('rb-name').value;
  SFX.click();
  render();
  setTimeout(() => { const el = document.getElementById('rb-name'); if (el && RB.name) el.value = RB.name; }, 50);
};

G.rbRemove = (i) => { RB.exercises.splice(i, 1); render(); };

G.rbSave = async (giver) => {
  const name = document.getElementById('rb-name').value;
  await api('/routines', { method: 'POST', body: { name, giver, exercises: RB.exercises } });
  RB.exercises = []; RB.name = '';
  SFX.fanfare();
  toast('Routine forged.');
  render();
};

G.deleteRoutine = async (rid, giver) => {
  if (!confirm('Burn this routine?')) return;
  await api(`/routines/${rid}`, { method: 'DELETE' });
  render();
};

/* ================= QUEST TRAINING LOG ================= */

const L = { weights: {}, reps: {}, showHow: {} };

SCREENS.logger = async function () {
  const questId = S.params.quest || null;
  const quest = questId ? S.state.active_quests.find(q => q.id === questId) : null;
  if (!quest) {
    $app().innerHTML = shell(`<div class="win center">
      <p class="muted">No quest in hand. Accept one from Grunhilda or Ser Bram first.</p>
    </div>`);
    return;
  }
  const recent = (await api('/lifts/recent?limit=100')).sets;
  const wu = S.state.settings.weight_unit;

  const exRow = (r, i) => {
    const done = recent.filter(s => s.quest_id === questId && s.exercise === r.exercise).length;
    const w = L.weights[r.exercise] ?? r.suggest_weight ?? 0;
    const reps = L.reps[r.exercise] ?? r.reps;
    const how = (S.exercises.find(e => e.name === r.exercise) || {}).how;
    const dots = Array.from({ length: r.sets }, (_, k) =>
      `<span class="${k < done ? 'done' : 'todo'}">&#9632;</span>`).join('');
    return `<div class="ex-row" id="ex-${i}">
      <div><span class="ex-name">${esc(r.exercise)}</span>
        <span class="ex-target">${r.sets}&times;${r.reps}${r.unit === 'seconds' ? 's' : ''}</span>
        ${how ? `<button class="btn small" style="min-width:0;padding:0 8px" onclick="L.showHow[${i}]=!L.showHow[${i}];render()">?</button>` : ''}
        <span class="setdots" style="float:right">${dots}</span></div>
      <div class="muted" style="font-size:16px">${(r.groups || []).join(' / ')}</div>
      ${L.showHow[i] && how ? `<div class="muted" style="font-size:17px;border-left:2px solid var(--gold);padding-left:8px;margin:6px 0">${esc(how)}</div>` : ''}
      <div class="stepper">
        <button class="btn" onclick="G.step('${esc(r.exercise)}','weights',-2.5,${i})">&minus;</button>
        <span class="val">${w}<span class="muted" style="font-size:16px">${wu}</span></span>
        <button class="btn" onclick="G.step('${esc(r.exercise)}','weights',2.5,${i})">+</button>
        <button class="btn" onclick="G.step('${esc(r.exercise)}','reps',-1,${i})">&minus;</button>
        <span class="val">${reps}<span class="muted" style="font-size:16px">reps</span></span>
        <button class="btn" onclick="G.step('${esc(r.exercise)}','reps',1,${i})">+</button>
      </div>
      <button class="btn big green" onclick="G.logSet('${esc(r.exercise)}',${questId},${i})">LOG SET (${done}/${r.sets})</button>
    </div>`;
  };

  const today = new Date().toISOString().slice(0, 10);
  const todays = recent.filter(s => s.ts.startsWith(today));

  $app().innerHTML = shell(`
    <div class="win"><span class="win-title">Quest: ${esc(quest.title)}</span>
      <div class="muted">${esc(quest.details.structure)}</div>
      ${quest.details.routine.map(exRow).join('')}
      <div class="center" style="margin-top:8px">
        <button class="btn green" onclick="nav('giver',{giver:'${quest.giver}'})">DONE — SEE ${esc(S.state.givers[quest.giver].name).toUpperCase()}</button>
      </div>
    </div>
    <div class="win"><span class="win-title">Today's Iron (${todays.length} sets)</span>
      <div class="loglist">${todays.length ? todays.map(s =>
        `<div><b>${esc(s.exercise)}</b> — ${s.weight}${wu} &times; ${s.reps} <span class="muted">${s.ts.slice(11, 16)}</span>
          <button class="btn small" style="min-width:0;padding:0 8px" onclick="G.editSet(${s.id},'${esc(s.exercise)}',${s.weight},${s.reps})">fix</button></div>`).join('')
        : '<span class="muted">Nothing yet. The bell is patient.</span>'}</div>
    </div>
  `);
};

G.step = (ex, field, delta, i) => {
  const cur = L[field][ex] ?? (field === 'weights' ? (questSuggest(ex) ?? 0) : questReps(ex) ?? 8);
  L[field][ex] = Math.max(0, Math.round((cur + delta) * 10) / 10);
  SFX.click();
  render();
};

function questSuggest(ex) {
  for (const q of S.state.active_quests) {
    const r = (q.details.routine || []).find(x => x.exercise === ex);
    if (r) return r.suggest_weight;
  }
  return null;
}
function questReps(ex) {
  for (const q of S.state.active_quests) {
    const r = (q.details.routine || []).find(x => x.exercise === ex);
    if (r) return r.reps;
  }
  return null;
}

G.logSet = async (ex, questId, i) => {
  const w = L.weights[ex] ?? questSuggest(ex) ?? 0;
  const reps = L.reps[ex] ?? questReps(ex) ?? 8;
  await api('/lifts', { method: 'POST', body: { exercise: ex, weight: w, reps, quest_id: questId } });
  SFX.coin();
  render();
};

/* set editor: fix or strike a single entry */
G.editSet = (id, exercise, weight, reps) => {
  const wu = S.state.settings.weight_unit;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = `<div class="win"><span class="win-title">Amend: ${esc(exercise)}</span>
    <div class="stepper" style="justify-content:center">
      <button class="btn" onclick="G.esAdj('w',-2.5)">&minus;</button>
      <span class="val" id="es-w">${weight}<span class="muted" style="font-size:16px">${wu}</span></span>
      <button class="btn" onclick="G.esAdj('w',2.5)">+</button>
      <button class="btn" onclick="G.esAdj('r',-1)">&minus;</button>
      <span class="val" id="es-r">${reps}<span class="muted" style="font-size:16px">reps</span></span>
      <button class="btn" onclick="G.esAdj('r',1)">+</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px">
      <button class="btn green" onclick="G.esSave(${id})">SAVE CORRECTION</button>
      <button class="btn danger" onclick="G.esDelete(${id})">STRIKE IT</button>
      <button class="btn small" style="min-width:0" onclick="this.closest('.overlay').remove()">cancel</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
};

G.esAdj = (which, delta) => {
  const el = document.getElementById('es-' + which);
  const cur = parseFloat(el.childNodes[0].textContent);
  el.childNodes[0].textContent = Math.max(0, Math.round((cur + delta) * 10) / 10);
  SFX.click();
};

G.esSave = async (id) => {
  const w = parseFloat(document.getElementById('es-w').childNodes[0].textContent);
  const r = parseFloat(document.getElementById('es-r').childNodes[0].textContent);
  await api(`/lifts/${id}`, { method: 'PATCH', body: { weight: w, reps: r } });
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  toast('Wick corrects the record.');
  render();
};

G.esDelete = async (id) => {
  await api(`/lifts/${id}`, { method: 'DELETE' });
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  toast('Struck from the record.');
  render();
};

/* ================= HALL OF RECORDS ================= */

let statsTab = 'body';
let calState = null;

SCREENS.stats = async function () {
  const d = await api('/stats');
  const chron = statsTab === 'chronicle' ? (await api('/chronicle')).events : [];
  const c = d.character;
  const wu = S.state.settings.weight_unit;

  const tabBtn = (id, label) =>
    `<button class="btn small ${statsTab === id ? 'active' : ''}" style="min-width:0" onclick="SFX.click();statsTab='${id}';render()">${label}</button>`;

  let body = '';
  if (statsTab === 'body') {
    const sb = (label, val, color) => `<div class="statbar">
      <span class="sb-label">${label}</span>
      <span class="sb-track"><span class="sb-fill" style="display:block;width:${Math.min(100, val * 2)}%;background:${color}"></span></span>
      <span class="sb-val">${val}</span></div>`;
    body = `<div class="win"><span class="win-title">${esc(c.name)}, Level ${c.level}</span>
      ${sb('STR', c.stats.str, 'var(--red)')}
      ${sb('END', c.stats.end, 'var(--green)')}
      ${sb('CON', c.stats.con, 'var(--gold)')}
      ${sb('SPR', c.stats.spr, 'var(--blue)')}
      <hr class="rule">
      <table class="rpg">
        <tr><td>Quests completed</td><td>${c.quests_done}</td></tr>
        <tr><td>Current streak</td><td>${c.streak.count} day(s) — best ${c.streak.best || c.streak.count}</td></tr>
        <tr><td>Deepest floor survived</td><td>${c.deepest_floor || '—'}</td></tr>
        <tr><td>Deaths in the Undercroft</td><td>${c.deaths}</td></tr>
      </table>
    </div>`;
  } else if (statsTab === 'vitals') {
    const w = d.wellness;
    const latest = (f) => { for (let i = w.length - 1; i >= 0; i--) if (w[i][f] != null) return w[i][f]; return null; };
    const chart = (id, label, f, color, fmt) => {
      const has = w.some(r => r[f] != null);
      return has ? `<div style="margin:10px 0"><span class="muted" style="text-transform:uppercase;font-size:15px">${label}
        ${latest(f) != null ? `— <span style="color:${color}">${fmt(latest(f))}</span>` : ''}</span>
        <canvas class="chart" id="${id}" width="440" height="90"></canvas></div>` : '';
    };
    // sleep: last night + 7-night average, drawn as a small hall-of-rest panel
    const sleepVals = w.map(r => r.sleep_secs).filter(v => v != null);
    const lastSleep = sleepVals.length ? sleepVals[sleepVals.length - 1] / 3600 : null;
    const wk = w.slice(-7).map(r => r.sleep_secs).filter(v => v != null);
    const avgSleep = wk.length ? (wk.reduce((a, b) => a + b, 0) / wk.length) / 3600 : null;
    const sleepVerdict = (h) => h == null ? '' : h >= 7.5 ? '<span style="color:var(--green)">well rested</span>'
      : h >= 6.5 ? '<span style="color:var(--gold-bright)">passable</span>' : '<span style="color:var(--red)">running a debt</span>';
    const sleepPanel = sleepVals.length ? `
      <div class="sleep-panel">
        <div class="sleep-stat"><span class="muted">LAST NIGHT</span><span class="sleep-big">${lastSleep.toFixed(1)}h</span></div>
        <div class="sleep-stat"><span class="muted">7-NIGHT AVG</span><span class="sleep-big">${avgSleep.toFixed(1)}h</span></div>
        <div class="sleep-stat"><span class="muted">THE VERDICT</span><span>${sleepVerdict(avgSleep)}</span></div>
      </div>` : '';

    body = `<div class="win"><span class="win-title">Vitals (from intervals.icu)</span>
      ${w.length === 0 ? '<div class="muted">No wellness data yet. Link intervals.icu in Settings and send the ravens.</div>' : ''}
      ${chart('ch-hrv', 'HRV', 'hrv', 'var(--green)', v => v.toFixed(0) + ' ms')}
      ${chart('ch-rhr', 'Resting heart rate', 'resting_hr', 'var(--red)', v => v.toFixed(0) + ' bpm')}
      ${chart('ch-vo2', 'VO2max', 'vo2max', 'var(--blue)', v => v.toFixed(1))}
      ${chart('ch-ctl', 'Fitness (CTL)', 'ctl', 'var(--gold-bright)', v => v.toFixed(0))}
      ${chart('ch-wt', 'Bodyweight', 'weight', 'var(--purple)', v => v.toFixed(1))}
    </div>
    ${sleepVals.length ? `<div class="win"><span class="win-title">The Hall of Rest</span>
      ${sleepPanel}
      <div class="muted" style="font-size:15px;margin-bottom:2px">hours slept per night — heroes are made in bed</div>
      <canvas class="chart" id="ch-sleep" width="440" height="90"></canvas>
    </div>` : ''}`;
  } else if (statsTab === 'deeds') {
    const rs = d.run_summary;
    body = `<div class="win"><span class="win-title">The Road (12 weeks)</span>
      <canvas class="chart" id="ch-run" width="440" height="120"></canvas>
      <div class="muted" style="font-size:16px">weekly run minutes</div>
      <hr class="rule">
      <table class="rpg"><tr><td>Runs recorded (60d)</td><td>${rs.n}</td></tr>
      <tr><td>Typical run</td><td>${Math.round(rs.median)} min</td></tr>
      <tr><td>Weekly volume (4w avg)</td><td>${rs.weekly_min} min</td></tr></table>
    </div>
    <div class="win"><span class="win-title">Recent Deeds</span>
      <table class="rpg"><tr><th></th><th>date</th><th>deed</th><th>time</th><th>dist</th></tr>
      ${d.recent_activities.map(a => `<tr><td><span class="cdot cat-${a.category}"></span></td>
        <td>${a.start.slice(0, 10)}</td><td>${esc(a.name || a.type)}</td>
        <td>${a.moving_time ? Math.round(a.moving_time / 60) + 'm' : '—'}</td>
        <td>${a.distance ? (a.distance / 1000).toFixed(1) + 'km' : '—'}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">nothing recorded yet</td></tr>'}
      </table>
    </div>`;
  } else if (statsTab === 'iron') {
    const rows = Object.entries(d.muscles).map(([g, m]) => {
      const cls = m.days_since <= 3 ? 'fresh-0' : m.days_since <= 7 ? 'fresh-1' : 'fresh-2';
      const label = m.days_since >= 999 ? 'never' : m.days_since === 0 ? 'today' : m.days_since + 'd ago';
      return `<tr><td>${g}</td><td class="${cls}">${label}</td><td>${m.sets_14d}</td>
        <td class="${cls}">${m.days_since > 7 ? 'NEGLECTED' : m.days_since > 3 ? 'due' : 'fresh'}</td></tr>`;
    }).join('');
    body = `<div class="win"><span class="win-title">Muscle Ledger</span>
      <div class="center">${bodyMapTag(Object.entries(d.muscles).filter(([, m]) => m.days_since <= 3).map(([g]) => g), 130)}</div>
      <div class="muted center" style="font-size:15px;margin-bottom:6px">lit: trained in the last 3 days (climbing counts for back/arms/core)</div>
      <table class="rpg"><tr><th>group</th><th>last trained</th><th>sets 14d</th><th>state</th></tr>${rows}</table>
    </div>
    <div class="win"><span class="win-title">Tonnage (12 weeks)</span>
      <canvas class="chart" id="ch-ton" width="440" height="120"></canvas>
      <div class="muted" style="font-size:16px">weekly ${wu} lifted (weight &times; reps)</div>
    </div>
    <div class="win"><span class="win-title">Personal Records</span>
      <table class="rpg"><tr><th>lift</th><th>max</th><th>est 1RM</th><th>sets</th></tr>
      ${d.prs.map(p => `<tr><td>${esc(p.exercise)}</td><td>${p.max_w}${wu}</td>
        <td>${Math.round(p.e1rm)}${wu}</td><td>${p.sets}</td></tr>`).join('') || '<tr><td colspan=4 class="muted">no iron logged yet</td></tr>'}
      </table>
    </div>`;
  } else if (statsTab === 'calendar') {
    body = await calendarBody();
  } else if (statsTab === 'compendium') {
    body = compendiumBody();
  } else {
    body = `<div class="win"><span class="win-title">The Chronicle</span>
      <div class="chron">${chron.map(e => `<div class="ev"><span class="ts">${e.ts.slice(5, 16).replace('T', ' ')}</span> ${esc(e.text)}</div>`).join('') || '<span class="muted">history not yet written</span>'}</div>
    </div>`;
  }

  $app().innerHTML = shell(`
    <div class="win tight">
      <div class="curator-box">
        ${spriteTag('maud', 96)}
        <div style="flex:1">
          <div class="npc-name" style="color:var(--gold-bright)">Maud, Curator of the Hall <span class="muted" style="font-size:15px">(an owl, somehow)</span></div>
          <div id="curator-dlg" style="min-height:24px;font-size:19px"></div>
          <div style="margin-top:6px">${d.insights.map(([lv, txt]) => `<div class="insight ${lv}" style="font-size:18px;margin:5px 0">${esc(txt)}</div>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="tabs">${tabBtn('body', 'Body')}${tabBtn('vitals', 'Vitals')}${tabBtn('deeds', 'The Road')}${tabBtn('iron', 'The Iron')}${tabBtn('calendar', 'Calendar')}${tabBtn('compendium', 'Compendium')}${tabBtn('chronicle', 'Chronicle')}</div>
    ${body}
  `);
  typewrite(document.getElementById('curator-dlg'), 'The full readings, hot from the archive. Hoo.');
  if (statsTab === 'deeds') drawBars('ch-run', d.weeks.map(w => w.run_min), '#7ab55c');
  if (statsTab === 'iron') drawBars('ch-ton', d.weeks.map(w => w.tonnage), '#c85050');
  if (statsTab === 'vitals') {
    const w = d.wellness;
    const pts = (f) => w.filter(r => r[f] != null).map(r => r[f]);
    drawLine('ch-hrv', pts('hrv'), '#7ab55c');
    drawLine('ch-rhr', pts('resting_hr'), '#c85050');
    drawLine('ch-vo2', pts('vo2max'), '#6aa0c8');
    drawLine('ch-ctl', pts('ctl'), '#f0d080');
    drawLine('ch-wt', pts('weight'), '#a06ac8');
    drawLine('ch-sleep', pts('sleep_secs').map(s => s / 3600), '#6aa0c8');
  }
};

/* ---- compendium (Hall of Records tab) ---- */

const COMP = { open: {} };
function compendiumBody() {
  const byEquip = {};
  S.exercises.forEach(e => (byEquip[e.equipment] = byEquip[e.equipment] || []).push(e));
  const section = (eq, label) => byEquip[eq] ? `
    <div class="win"><span class="win-title">${label}</span>
      ${byEquip[eq].map(e => `<div class="shop-row" style="cursor:pointer" onclick="COMP.open['${esc(e.name)}']=!COMP.open['${esc(e.name)}'];render()">
        <span class="grow"><span class="s-name">${esc(e.name)}</span><br>
          <span class="s-desc">targets: ${e.groups.join(', ')}</span>
          ${COMP.open[e.name] ? `<div class="muted" style="font-size:17px;border-left:2px solid var(--gold);padding-left:8px;margin-top:6px">${esc(e.how || '')}</div>` : ''}</span>
        ${bodyMapTag(e.groups, 90)}
      </div>`).join('')}
    </div>` : '';
  return `<div class="muted center" style="margin:4px 0">The Compendium of Honest Labor — tap a lift for the how.
      Left figure: front. Right: back.</div>
    ${section('kettlebell', 'The Bell')}
    ${section('barbell', 'The Bar')}
    ${section('dumbbell', 'The Dumbbells')}
    ${section('bodyweight', 'The Body Itself')}`;
}

/* ---- real month calendar ---- */

async function calendarBody() {
  if (!calState) {
    const t = new Date();
    calState = { y: t.getFullYear(), m: t.getMonth() + 1 };
  }
  const cal = await api(`/calendar?year=${calState.y}&month=${calState.m}`);
  const first = new Date(calState.y, calState.m - 1, 1);
  const startDow = (first.getDay() + 6) % 7; // monday-first
  const daysInMonth = new Date(calState.y, calState.m, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthName = first.toLocaleString('default', { month: 'long' });

  let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += '<div class="calday other"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const dstr = `${calState.y}-${String(calState.m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = cal.days[dstr];
    let dots = '';
    if (info) {
      dots = info.acts.slice(0, 6).map(a => `<span class="cdot cat-${a.category}" title="${esc(a.name || a.type)}"></span>`).join('');
      if (info.sets > 0 && !info.acts.some(a => a.category === 'strength')) dots += '<span class="cdot cat-strength" title="lifting logged"></span>';
    }
    cells += `<div class="calday ${dstr === todayStr ? 'today' : ''}" onclick="G.dayDetail('${dstr}')">
      <span class="dn">${day}</span>
      ${info && info.quests ? `<span class="qmark">&#9733;${info.quests > 1 ? info.quests : ''}</span>` : ''}
      <div class="caldots">${dots}</div>
    </div>`;
  }

  const legend = Object.entries(CAT_LABELS).map(([k, v]) =>
    `<span><span class="cdot cat-${k}"></span>${v}</span>`).join('');

  return `<div class="win"><span class="win-title">Calendar of Deeds</span>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <button class="btn small" style="min-width:0" onclick="G.calNav(-1)">&#9668;</button>
      <span style="font-size:24px;color:var(--gold-bright)">${monthName} ${calState.y}</span>
      <button class="btn small" style="min-width:0" onclick="G.calNav(1)">&#9658;</button>
    </div>
    <div class="calgrid">${cells}</div>
    <div class="legend">${legend}<span><span style="color:var(--gold-bright)">&#9733;</span> quest done</span></div>
    <div class="muted" style="font-size:16px;margin-top:6px">tap a day to inspect, fix, or strike entries</div>
  </div>`;
}

G.calNav = (dir) => {
  SFX.click();
  calState.m += dir;
  if (calState.m < 1) { calState.m = 12; calState.y--; }
  if (calState.m > 12) { calState.m = 1; calState.y++; }
  render();
};

G.dayDetail = async (dstr) => {
  const d = await api(`/day/${dstr}`);
  const wu = S.state.settings.weight_unit;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  const acts = d.activities.map(a => `<div class="shop-row">
    <span class="cdot cat-${a.category}"></span>
    <span class="grow"><span class="s-name">${esc(a.name || a.type)}</span><br>
      <span class="s-desc">${a.minutes ? a.minutes + ' min' : ''} ${a.distance ? '&middot; ' + (a.distance / 1000).toFixed(1) + 'km' : ''} &middot; ${esc(a.source)}</span></span>
    <button class="btn small danger" style="min-width:0" onclick="G.strikeActivity('${a.id}')">strike</button>
  </div>`).join('');
  const sets = d.sets.map(s => `<div class="shop-row">
    <span class="cdot cat-strength"></span>
    <span class="grow"><span class="s-name">${esc(s.exercise)}</span> <span class="s-desc">${s.weight}${wu} &times; ${s.reps}</span></span>
    <button class="btn small" style="min-width:0" onclick="G.editSet(${s.id},'${esc(s.exercise)}',${s.weight},${s.reps})">fix</button>
  </div>`).join('');
  const quests = d.quests.map(q => `<div class="shop-row"><span style="color:var(--gold-bright)">&#9733;</span>
    <span class="grow"><span class="s-name">${esc(q.title)}</span></span></div>`).join('');
  ov.innerHTML = `<div class="win"><span class="win-title">${dstr}</span>
    ${acts || ''}${sets || ''}${quests || ''}
    ${d.sets.length ? `<div class="center" style="margin-top:8px"><button class="btn danger small" style="min-width:0" onclick="G.strikeDay('${dstr}',${d.sets.length})">STRIKE WHOLE LIFTING SESSION (${d.sets.length} sets)</button></div>` : ''}
    ${!acts && !sets && !quests ? '<p class="muted">A day of rest. The ledger holds nothing against you.</p>' : ''}
    <div class="center" style="margin-top:10px"><button class="btn small" style="min-width:0" onclick="this.closest('.overlay').remove()">close</button></div>
  </div>`;
  document.body.appendChild(ov);
};

G.strikeActivity = async (id) => {
  if (!confirm('Strike this entire workout from the record? Wick will not restore it.')) return;
  await api(`/activities/${id}`, { method: 'DELETE' });
  toast('Struck from the record.');
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  render();
};

G.strikeDay = async (dstr, n) => {
  if (!confirm(`Strike all ${n} sets from ${dstr}? The whole session, gone.`)) return;
  await api(`/lifts/day/${dstr}`, { method: 'DELETE' });
  toast('The session is struck from the record.');
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  render();
};

function drawBars(id, vals, color) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, n = vals.length;
  const max = Math.max(...vals, 1);
  ctx.clearRect(0, 0, W, H);
  const bw = Math.floor(W / n) - 4;
  vals.forEach((v, i) => {
    const h = Math.round((v / max) * (H - 24));
    const x = i * Math.floor(W / n) + 2;
    ctx.fillStyle = i === n - 1 ? '#f0d080' : color;
    ctx.fillRect(x, H - 14 - h, bw, h);
    if (v > 0) {
      ctx.fillStyle = '#776f8e';
      ctx.font = '12px monospace';
      ctx.fillText(String(v), x, H - 2);
    }
  });
}

function drawLine(id, vals, color) {
  const cv = document.getElementById(id);
  if (!cv || !vals.length) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, n = vals.length;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#33304a';
  ctx.font = '11px monospace';
  ctx.fillText(String(Math.round(max * 10) / 10), 2, 10);
  ctx.fillText(String(Math.round(min * 10) / 10), 2, H - 3);
  const px = (i) => 30 + i * ((W - 36) / Math.max(1, n - 1));
  const py = (v) => 8 + (1 - (v - min) / span) * (H - 20);
  ctx.fillStyle = color;
  let prevY = py(vals[0]);
  vals.forEach((v, i) => {
    const x = px(i), y = py(v);
    const x0 = i === 0 ? x : px(i - 1);
    const step = 3;
    for (let sx = x0; sx <= x; sx += step) {
      const t = (sx - x0) / Math.max(1, x - x0);
      ctx.fillRect(sx, prevY + (y - prevY) * t - 1, step, 3);
    }
    prevY = y;
  });
}

/* ================= SCRIVENER (confess & amend) ================= */

SCREENS.scrivener = async function () {
  const types = (await api('/claim/types')).types;
  const today = new Date().toISOString().slice(0, 10);
  const recent = await api('/day/' + today);
  const wu = S.state.settings.weight_unit;
  const line = congratLine('wick') || pickLine(GREETINGS.wick);

  $app().innerHTML = shell(`
    <div class="win">
      <div class="npc-head">
        ${spriteTag('wick', 128)}
        <div class="dialog"><div class="npc-name">Wick the Scrivener</div><div id="dlg"></div></div>
      </div>
    </div>
    <div class="win"><span class="win-title">Confess a Deed (unverified)</span>
      <div class="muted" style="font-size:17px;margin-bottom:8px">Forgot your tracker at the crag? Swear it before Wick.
        No witness means prorated pay: seven coins in ten.</div>
      <div class="formrow"><label>what was done</label>
        <select id="cl-kind">${types.map(t => `<option value="${t.kind}">${esc(t.label)}</option>`).join('')}</select></div>
      <div class="formrow"><label>for how long (minutes)</label>
        <input type="number" id="cl-min" value="60" min="1" max="600" step="1" inputmode="numeric"
          style="max-width:120px" oninput="this.value=this.value.replace(/[^0-9]/g,'')"></div>
      <div class="formrow"><label>note (optional)</label><input type="text" id="cl-note" placeholder="e.g. bouldering at the gym"></div>
      <button class="btn big green" onclick="G.claim()">SWEAR IT ON THE LEDGER</button>
    </div>
    <div class="win"><span class="win-title">Today's Record (tap to fix)</span>
      ${recent.activities.map(a => `<div class="shop-row">
        <span class="cdot cat-${a.category}"></span>
        <span class="grow"><span class="s-name">${esc(a.name || a.type)}</span><br><span class="s-desc">${a.minutes} min &middot; ${esc(a.source)}</span></span>
        <button class="btn small danger" style="min-width:0" onclick="G.strikeActivity('${a.id}')">strike</button>
      </div>`).join('') || ''}
      ${recent.sets.map(s => `<div class="shop-row">
        <span class="cdot cat-strength"></span>
        <span class="grow"><span class="s-name">${esc(s.exercise)}</span> <span class="s-desc">${s.weight}${wu} &times; ${s.reps}</span></span>
        <button class="btn small" style="min-width:0" onclick="G.editSet(${s.id},'${esc(s.exercise)}',${s.weight},${s.reps})">fix</button>
      </div>`).join('') || ''}
      ${!recent.activities.length && !recent.sets.length ? '<div class="muted">Nothing recorded today.</div>' : ''}
      <div class="muted" style="font-size:16px;margin-top:6px">older entries: Hall of Records &rarr; Calendar &rarr; tap a day</div>
    </div>
  `);
  typewrite(document.getElementById('dlg'), line);
};

G.claim = async () => {
  const kind = document.getElementById('cl-kind').value;
  const minutes = Math.max(1, Math.min(600, parseInt(document.getElementById('cl-min').value, 10) || 0));
  if (!minutes) { toast('How long, exactly? Give Wick a number of minutes.', true); return; }
  const note = document.getElementById('cl-note').value;
  const r = await api('/claim', { method: 'POST', body: { kind, minutes, note } });
  await refreshState();
  render();
  showCeremony(r.rewards, 'A Deed Sworn');
};

/* ================= KRANKWERK (pull the lever!) ================= */

let krankPay = null;

SCREENS.krank = function () {
  const c = S.state.character;
  if (krankPay === null) krankPay = c.tokens > 0 ? 'token' : 'gold';
  if (krankPay === 'token' && c.tokens < 1) krankPay = 'gold';
  const canPay = krankPay === 'token' ? c.tokens >= 1 : c.gold >= 35;
  $app().innerHTML = shell(`
    <div class="win krank">
      <div class="pixel-title" style="font-size:20px;margin-bottom:8px">THE KRANKWERK</div>
      <div class="muted">It vends delights for the Menagerie: hats, finery, whole packs of creatures.<br>
        <b style="color:var(--gold-bright)">Grip the lever. Pull it all the way down.</b></div>
      <div class="krank-stage">
        <div class="krank-machine" id="krank-m" style="margin:14px 0">${spriteTag('krank', 176)}<div class="capsule" id="krank-cap"></div></div>
        <div class="lever snap" id="lever">
          <div class="track"></div>
          <div class="knob" id="lever-knob">PULL</div>
        </div>
      </div>
      <div class="krank-pay" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn small ${krankPay === 'token' ? 'pay-active' : ''}" style="min-width:0" ${c.tokens < 1 ? 'disabled' : ''}
          onclick="krankPay='token';render()">${spriteTag('icon_token', 14)} TOKEN (${c.tokens})</button>
        <button class="btn small ${krankPay === 'gold' ? 'pay-active' : ''}" style="min-width:0" ${c.gold < 35 ? 'disabled' : ''}
          onclick="krankPay='gold';render()">${spriteTag('icon_coin', 14)} 35 GOLD</button>
      </div>
      ${!canPay ? '<div class="muted" style="margin-top:6px">the machine wants a token or 35 gold</div>' : ''}
      <div class="muted" style="margin-top:10px;font-size:17px">
        odds: <span class="r-common">common</span> &middot; <span class="r-uncommon">uncommon</span> &middot; <span class="r-rare">rare</span> &middot; <span class="r-legendary">LEGENDARY</span>
      </div>
    </div>
  `);
  initLever(canPay);
};

function initLever(enabled) {
  const lever = document.getElementById('lever');
  const knob = document.getElementById('lever-knob');
  if (!lever) return;
  const MAX = 140;
  let dragging = false, startY = 0, prog = 0, lastTick = 0, fired = false;

  const setKnob = (p) => { knob.style.top = Math.round(p * MAX) + 'px'; };

  lever.addEventListener('pointerdown', (e) => {
    if (!enabled || fired) { SFX.error(); return; }
    dragging = true; startY = e.clientY - prog * MAX;
    lever.classList.remove('snap');
    lever.setPointerCapture(e.pointerId);
  });
  lever.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    prog = Math.max(0, Math.min(1, (e.clientY - startY) / MAX));
    setKnob(prog);
    const tick = Math.floor(prog * 8);
    if (tick !== lastTick) { lastTick = tick; SFX.click(); }
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    lever.classList.add('snap');
    if (prog >= 0.92) {
      fired = true;
      setKnob(1);
      G.crank(krankPay === 'token');
    } else {
      prog = 0; setKnob(0);
    }
  };
  lever.addEventListener('pointerup', release);
  lever.addEventListener('pointercancel', release);
}

function sparkleBurst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.style.background = color;
    s.style.left = x + 'px'; s.style.top = y + 'px';
    document.body.appendChild(s);
    const ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 110;
    requestAnimationFrame(() => {
      s.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 30}px) rotate(${Math.random() * 360}deg)`;
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 1000);
  }
}

G.crank = async (useToken) => {
  const m = document.getElementById('krank-m');
  let r;
  try {
    r = await api('/gacha', { method: 'POST', body: { use_token: useToken } });
  } catch (e) { render(); return; }

  m.classList.add('krank-shake');
  SFX.crank();
  setTimeout(() => {
    const cap = document.getElementById('krank-cap');
    if (cap) cap.classList.add('drop');
    SFX.coin();
  }, 900);
  setTimeout(async () => {
    await refreshState();
    const rare = r.item.rarity;
    const rcolor = { common: '#b8b8b8', uncommon: '#7ab55c', rare: '#6aa0c8', legendary: '#e0a030' }[rare];
    const flash = document.createElement('div');
    flash.className = 'flashwipe';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 550);
    if (rare === 'legendary' || rare === 'rare') {
      document.body.classList.add('megashake');
      setTimeout(() => document.body.classList.remove('megashake'), 800);
    }
    SFX.reveal(rare);
    const isWearable = r.item.type === 'hat';
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="win ceremony gacha-card ${rare === 'legendary' ? 'legendary-glow' : ''}">
      <div class="muted">the capsule cracks open...</div>
      <div style="margin:12px auto;display:flex;justify-content:center">${spriteTag(r.item.sprite, 96)}</div>
      <div class="r-${rare}" style="font-size:30px">${esc(r.item.name)}</div>
      <div class="muted" style="text-transform:uppercase;font-size:16px">${rare} ${r.item.type}</div>
      <p style="margin-top:8px">${esc(r.item.desc)}</p>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${isWearable || r.item.type === 'pack' || r.item.type === 'decor' ? `<button class="btn big" style="width:auto" onclick="this.closest('.overlay').remove();nav('ranch')">TO THE MENAGERIE</button>` : ''}
        <button class="btn" onclick="this.closest('.overlay').remove();render()">TAKE IT</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    hydrateSprites(ov);
    const rect = ov.querySelector('.gacha-card').getBoundingClientRect();
    sparkleBurst(rect.left + rect.width / 2, rect.top + 60, rcolor, rare === 'legendary' ? 30 : 14);
  }, 1900);
};

/* ================= SETTINGS ================= */

SCREENS.settings = function () {
  const s = S.state.settings;
  const c = S.state.character;
  const amb = S.state.ambition_levels;
  $app().innerHTML = shell(`
    <div class="win"><span class="win-title">Who Are You</span>
      <div class="formrow"><label>name</label>
        <div style="display:flex;gap:6px">
          <input type="text" id="set-name" value="${esc(c.name)}" style="flex:1" onkeydown="if(event.key==='Enter')G.saveName()">
          <button class="btn small" style="min-width:0" onclick="G.saveName()">SAVE NAME</button>
        </div>
      </div>
      <div class="muted" style="font-size:16px;margin:6px 0">to change your look, tap your portrait at the top of any page</div>
      <hr class="rule">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn small" style="min-width:0" onclick="G.setPinPrompt()">SET / CHANGE PIN</button>
        <button class="btn small" style="min-width:0" onclick="G.switchProfile()">SWITCH ADVENTURER</button>
      </div>
    </div>
    <div class="win"><span class="win-title">Ambition</span>
      <div class="muted" style="margin-bottom:8px">how hard the quest-givers push you</div>
      ${amb.map((a, i) => `<button class="btn" style="margin:3px;${s.ambition === i ? 'background:var(--gold);color:var(--bg)' : ''}"
        onclick="G.setAmbition(${i})">${a.name}</button>`).join('')}
      <div class="muted" style="margin-top:6px">${esc(amb[s.ambition].desc)}</div>
    </div>
    <div class="win"><span class="win-title">The Ravens (intervals.icu)</span>
      <div class="muted" style="font-size:17px;margin-bottom:8px">
        Runs, climbs, lifts and wellness sync from intervals.icu — which itself syncs from Garmin,
        Strava, Coros, etc. First sync fetches ~400 days; after that the ravens fly every 15 minutes
        and completed workouts turn in quests automatically.
        Athlete ID and API key: intervals.icu &rarr; Settings &rarr; Developer.</div>
      <div class="formrow"><label>athlete id (e.g. i12345)</label><input type="text" id="set-aid" value="${esc(s.intervals_athlete_id)}"></div>
      <div class="formrow"><label>api key ${s.intervals_api_key ? '(saved — leave blank to keep)' : ''}</label><input type="password" id="set-key" placeholder="${s.intervals_api_key ? '••••••••' : ''}"></div>
      <button class="btn" onclick="G.saveSettings(true)">SAVE &amp; SEND RAVENS</button>
    </div>
    <div class="win"><span class="win-title">Units</span>
      <div class="formrow"><label>weights</label>
        <select id="set-wu"><option ${s.weight_unit === 'kg' ? 'selected' : ''}>kg</option><option ${s.weight_unit === 'lb' ? 'selected' : ''}>lb</option></select></div>
      <button class="btn" onclick="G.saveSettings(false)">SAVE</button>
    </div>
    <div class="win"><span class="win-title">Dev Mode</span>
      <div class="muted" style="font-size:17px;margin-bottom:6px">for testing features without living an entire second life</div>
      <button class="btn ${s.dev_mode ? 'danger' : ''}" onclick="G.toggleDev(${s.dev_mode ? 'false' : 'true'})">
        ${s.dev_mode ? 'DISABLE DEV MODE' : 'ENABLE DEV MODE'}</button>
      ${s.dev_mode ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        <button class="btn small" style="min-width:0" onclick="G.dev('gold')">+1000 gold</button>
        <button class="btn small" style="min-width:0" onclick="G.dev('tokens')">+10 tokens</button>
        <button class="btn small" style="min-width:0" onclick="G.dev('vigor')">fill vigor</button>
        <button class="btn small" style="min-width:0" onclick="G.dev('packs')">+3 monster packs</button>
        <button class="btn small" style="min-width:0" onclick="G.dev('hats')">hat sampler</button>
        <button class="btn small" style="min-width:0" onclick="G.dev('seed')">seed 60d of fake training</button>
        <button class="btn small" style="min-width:0" onclick="G.dev('unguided_run')">seed an unguided run (Fenn's bubble)</button>
        <button class="btn small danger" style="min-width:0" onclick="G.dev('wipe_dev')">wipe fake training</button>
      </div>` : ''}
    </div>
  `);
};

G.saveName = async () => {
  const name = document.getElementById('set-name').value.trim();
  if (!name) { toast('An adventurer needs a name.', true); return; }
  await api('/settings', { method: 'POST', body: { name } });
  await refreshState();
  SFX.accept();
  toast('Name saved.');
  render();
};

G.setPinPrompt = () => {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = `<div class="win center" style="max-width:320px">
    <span class="win-title">Set / Change PIN</span>
    <div class="muted" style="font-size:15px;margin-bottom:8px">4 digits — keeps this adventurer's save locked to whoever knows it.</div>
    <input type="password" inputmode="numeric" maxlength="4" id="np-setpin" class="pin-input"
      placeholder="&#8226;&#8226;&#8226;&#8226;" onkeydown="if(event.key==='Enter')G.submitSetPin()">
    <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
      <button class="btn green" onclick="G.submitSetPin()">SAVE PIN</button>
      <button class="btn small" style="min-width:0" onclick="this.closest('.overlay').remove()">cancel</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  document.getElementById('np-setpin').focus();
};

G.submitSetPin = async () => {
  const pin = document.getElementById('np-setpin').value;
  try {
    await api('/profiles/pin', { method: 'POST', body: { pin } });
  } catch (e) { return; }
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  SFX.accept();
  toast('PIN set. The roster keeper nods.');
};

G.toggleDev = async (on) => {
  await api('/settings', { method: 'POST', body: { dev_mode: on } });
  await refreshState();
  toast(on ? 'Dev mode on. Reality is now negotiable.' : 'Dev mode off.');
  render();
};

G.dev = async (action) => {
  await api('/dev', { method: 'POST', body: { action } });
  await refreshState();
  SFX.coin();
  toast('Done: ' + action);
  render();
};

G.setAmbition = async (i) => {
  await api('/settings', { method: 'POST', body: { ambition: i } });
  await refreshState();
  toast('Ambition set: ' + S.state.ambition_levels[i].name);
  render();
};

G.saveSettings = async (sync) => {
  const body = {
    name: document.getElementById('set-name').value,
    intervals_athlete_id: document.getElementById('set-aid').value,
    weight_unit: document.getElementById('set-wu') ? document.getElementById('set-wu').value : undefined,
  };
  const key = document.getElementById('set-key').value;
  if (key) body.intervals_api_key = key;
  await api('/settings', { method: 'POST', body });
  await refreshState();
  toast('Scrolls updated.');
  if (sync) await G.syncNow();
  render();
};
