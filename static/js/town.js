/* The town square: the hub screen, Fenn's and the willow's bubbles, and
   the siege banner. */
/* Fenn's quip when his speech bubble pops out of the waystone for an
   unguided-run bonus — the fuller "note" line lives server-side in
   game.UNGUIDED_RUN_NOTES and shows in the ceremony that follows. */
const FENN_BUBBLE_LINES = [
  'Psst. I saw that run. You didn\u2019t even ask me first.',
  'Ran off without a word to me, did you? Rude. Here \u2014 take this anyway.',
  'The road tattled on you. Good thing I don\u2019t hold grudges as long as I hold coin.',
];

/* Time of day: the town's sky/ground/building art follows the player's real
   wall clock — day 6am-6pm, sunset 6-8pm, night 8pm-6am. Purely cosmetic,
   client-side, no server truth. Dev mode can pin it to a specific state to
   preview the art (devTOD non-null overrides the clock); the toggle cycles
   day -> sunset -> night -> auto -> day so a dev can always get back to
   watching it track real time. */
const TOD_ORDER = ['day', 'sunset', 'night', null];
const TOD_ICON = { day: 'icon_tod_sun', sunset: 'icon_tod_sunset', night: 'icon_tod_moon' };

function currentTOD() {
  const h = new Date().getHours();
  if (h >= 6 && h < 18) return 'day';
  if (h >= 18 && h < 20) return 'sunset';
  return 'night';
}

let devTOD = null;  // null = auto (follows currentTOD())
RESETS.push(() => { devTOD = null; });

G.cycleTOD = () => {
  devTOD = TOD_ORDER[(TOD_ORDER.indexOf(devTOD) + 1) % TOD_ORDER.length];
  render();
};

/* ================= TOWN ================= */

SCREENS.town = async function () {
  const st = S.state;
  const c = st.character;
  const effectiveTOD = devTOD || currentTOD();
  let siege = null;
  try { siege = await api('/raid'); } catch (e) { /* the walls hold without us */ }
  const activeBy = {};
  st.active_quests.forEach(q => activeBy[q.giver] = q);
  const bld = (sprite, name, sub, target, badge = false, px = 120, id = '') => `
    <div class="bld"${id ? ` id="${id}"` : ''} onclick="${target}">
      ${badge ? '<span class="bang">!</span>' : ''}
      ${buildingTag(sprite, effectiveTOD) || spriteTag(sprite, px)}
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
  const devMode = !!S.state.settings?.dev_mode;

  $app().innerHTML = shell(`
    ${siegeBanner}
    ${st.active_quests.length ? `<div class="win tight"><span class="win-title">Sworn Quests</span>
      ${st.active_quests.map(questRow).join('')}
    </div>` : ''}
    <div class="town-scene tod-${effectiveTOD}">
      ${devMode ? `<div class="tod-toggle" title="dev: cycle time of day (${devTOD ? 'pinned: ' + devTOD : 'auto: ' + effectiveTOD})" onclick="G.cycleTOD()">${spriteTag(TOD_ICON[effectiveTOD], 22)}</div>` : ''}
      <div class="trow">
        ${bld('bld_waystone', esc(g.running.name), GIVER_ROLES.running, `nav('giver',{giver:'running'})`, !!activeBy.running, 120, 'bld-fenn')}
        ${bld('bld_forge', esc(g.kettlebell.name), GIVER_ROLES.kettlebell, `nav('giver',{giver:'kettlebell'})`, !!activeBy.kettlebell)}
        ${bld('bld_keep', esc(g.strength.name), GIVER_ROLES.strength, `nav('giver',{giver:'strength'})`, !!activeBy.strength)}
        ${bld('bld_willow', esc(g.mobility.name), GIVER_ROLES.mobility, `nav('giver',{giver:'mobility'})`, !!activeBy.mobility, 120, 'bld-elowen')}
      </div>
      <div class="road-h"></div>
      <div class="trow">
        ${bld('bld_ledger', 'The Ledger House', 'Wick: confess & amend', `nav('scrivener')`)}
        ${bld('bld_hall', 'Hall of Records', 'stats, vitals & the Curator',
          st.almanac_unread ? `statsTab='almanac';nav('stats')` : `nav('stats')`, !!st.almanac_unread)}
        ${bld('crank', 'The Crankwerk', 'hats for the herd', `nav('crank')`)}
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

/* ---- The willow's writ bubble: Elowen sends word when a Rest Writ resolved
   overnight (kept or broken). Unlike Fenn's bubble, the rewards were ALREADY
   applied at resolution (the streak stitch can't wait for a tap) \u2014 the bubble
   is purely the moment of telling you. Same queue-mirror discipline as
   Fenn's: S.writQueue is replaced wholesale on every refreshState. ---- */
function showWillowBubbleIfQueued() {
  const next = S.writQueue && S.writQueue[0];
  const shown = document.querySelector('.willow-bubble-wrap');
  if (shown) {
    if (next && shown.dataset.ts === String(next.ts)) return;
    shown.remove();
  }
  if (!next) return;
  const anchor = document.getElementById('bld-elowen');
  if (!anchor) return;
  const kept = next.type === 'kept';
  anchor.insertAdjacentHTML('beforeend', `
    <div class="fenn-bubble-wrap willow-bubble-wrap" data-ts="${esc(next.ts)}">
      <div class="fenn-bubble willow" onclick="event.stopPropagation();G.ackWillowBubble()">
        <div class="fb-line">&ldquo;${kept ? 'The writ is kept. Rise rested \u2014 the Vale noticed.' : 'The iron called, and you answered. The willow does not scold.'}&rdquo;</div>
        ${kept ? `<div class="fb-rewards">
          <span style="color:var(--purple)">+${next.rewards.xp} XP</span>
          <span class="g">&#9670; +${next.rewards.gold}</span>
          <span style="color:#e07030">streak kept &middot; ${next.rewards.streak}</span>
        </div>` : ''}
        <button class="btn small ${kept ? 'green' : ''}">${kept ? 'WORD FROM THE WILLOW' : 'THE WRIT SLIPPED AWAY'}</button>
      </div>
    </div>`);
  SFX.coin();
}

G.ackWillowBubble = async () => {
  const b = S.writQueue && S.writQueue[0];
  if (!b) return;
  document.querySelectorAll('.willow-bubble-wrap').forEach(x => x.remove());
  const n = await api('/writ/ack', { method: 'POST', body: { ts: b.ts } });
  await refreshState();
  render();
  if (n.type === 'kept') {
    showCeremony(n.rewards, 'The Rest Writ \u2014 Kept');
  } else {
    SFX.accept();
    showModal(`<div class="win center" style="max-width:380px">
      <span class="win-title">The Writ Slipped Away</span>
      <p style="margin:10px 0">${esc(n.detail || 'Training')} broke the stillness. The willow bends; it does not break \u2014 and neither, apparently, do you.</p>
      <p class="muted" style="font-size:16px">No penalty. The omens will be read again tomorrow.</p>
      <button class="btn" onclick="this.closest('.overlay').remove()">ONWARD</button>
    </div>`);
  }
};

/* ---- the siege banner: a small breathing preview by default; expands into a
   D&D-style monster card (no health bar) with an expandable war-party board ---- */

const SIEGE = { collapsed: true, leaderOpen: {} };
RESETS.push(() => { SIEGE.collapsed = true; SIEGE.leaderOpen = {}; });

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
  showModal(`<div class="win ceremony">
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
  </div>`, { backdropClose: false });
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

