/* The town square: the hub screen, the givers' deed bubbles, the willow's
   writ bubble, and the siege banner. */
/* An unsworn deed pops a speech bubble from the giver whose archetype owns
   the effort (the server decides via quests.deed_giver; the fuller "note"
   line lives in quests.DEED_NOTES and shows in the ceremony that follows).
   Each entry: the building that anchors the bubble, the quip pool, and the
   claim-button label. */
const DEED_BUBBLES = {
  running: {
    anchor: 'bld-fenn',
    label: 'FENN LEFT THIS FOR YOU',
    lines: [
      'Psst. I saw that. You didn\u2019t even ask me first.',
      'Off without a word to me, were you? Rude. Here \u2014 take this anyway.',
      'The road tattled on you. Good thing I don\u2019t hold grudges as long as I hold coin.',
    ],
  },
  kettlebell: {
    anchor: 'bld-grun',
    label: 'GRUNHILDA HEARD THE BELL',
    lines: [
      'You swung without my blessing. The bell rang anyway. It always rings.',
      'Unsworn sweat still counts, little anvil. Take your due.',
      'I felt the ground shake and knew it was you. Here.',
    ],
  },
  strength: {
    anchor: 'bld-bram',
    label: 'SER BRAM TOOK NOTE',
    lines: [
      'Iron moved is iron moved, writ or no writ. Take your pay.',
      'You trained without orders. Good. Initiative suits you.',
      'The keep saw you working. A knight settles his debts.',
    ],
  },
  mobility: {
    anchor: 'bld-elowen',
    label: 'THE WILLOW SAW YOU BEND',
    lines: [
      'Stillness taken unbidden is stillness all the same.',
      'You practiced without asking leave. The practice counts. It always counts.',
      'The willow does not need a writ to notice you. Few things escape a tree.',
    ],
  },
  wick: {
    anchor: 'bld-wick',
    label: 'WICK RECORDED A DEED',
    lines: [
      'A deed reached the ledger without a writ. I recorded it. Obviously.',
      'Unsworn, unasked \u2014 still ink-worthy. Signed and sealed.',
      'The record keeps what the road forgets. Your pay, per the ledger.',
    ],
  },
};

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

const TOD_BOUNDARIES = [6, 18, 20];
let todTimer = null;

function nextTODBoundaryDelay(now = new Date()) {
  const hour = now.getHours();
  const nextHour = TOD_BOUNDARIES.find(h => h > hour) ?? 6;
  const next = new Date(now);
  if (nextHour <= hour) next.setDate(next.getDate() + 1);
  next.setHours(nextHour, 0, 0, 250);
  return Math.max(1000, next.getTime() - now.getTime());
}

function scheduleTODRefresh() {
  clearTimeout(todTimer);
  todTimer = null;
  if (S.screen !== 'town' || devTOD !== null) return;
  todTimer = setTimeout(() => {
    todTimer = null;
    if (S.screen === 'town' && devTOD === null) render();
  }, nextTODBoundaryDelay());
}

function watchRouteDeparture(routeToken, cleanup) {
  const root = $app();
  if (!root) return () => {};
  let active = true;
  const observer = new MutationObserver(() => {
    if (!active || isRouteTokenCurrent(routeToken)) return;
    active = false;
    observer.disconnect();
    cleanup();
  });
  observer.observe(root, { attributes: true, childList: true });
  return () => {
    active = false;
    observer.disconnect();
  };
}

let devTOD = null;  // null = auto (follows currentTOD())
RESETS.push(() => {
  devTOD = null;
  clearTimeout(todTimer);
  todTimer = null;
});

G.cycleTOD = () => {
  devTOD = TOD_ORDER[(TOD_ORDER.indexOf(devTOD) + 1) % TOD_ORDER.length];
  render();
};

/* ================= TOWN ================= */

SCREENS.town = async function () {
  const routeToken = captureRouteToken();
  const st = S.state;
  const c = st.character;
  let siege = null;
  try { siege = await api('/raid'); } catch (e) { /* the walls hold without us */ }
  if (!isRouteTokenCurrent(routeToken)) return;
  const effectiveTOD = devTOD || currentTOD();
  const activeBy = {};
  st.active_quests.forEach(q => activeBy[q.giver] = q);
  const bld = (sprite, name, sub, target, badge = false, px = 120, id = '') => `
    <div class="bld"${id ? ` id="${id}"` : ''}>
      ${badge ? '<span class="bang">!</span>' : ''}
      <button type="button" class="control-reset illustrated-control" style="display:block;width:100%"
        aria-label="Visit ${esc(name)}: ${esc(sub)}" onclick="${target}">
        ${buildingTag(sprite, effectiveTOD) || spriteTag(sprite, px)}
        <span class="plate">${esc(name)}<small>${esc(sub)}</small></span>
      </button>
    </div>`;
  const g = st.givers;

  const questRow = (q) => {
    // "log sets" belongs to quests that carry a routine — a climb quest from
    // Ser Bram completes by synced wall time, not the lift logger
    const lifting = ['kettlebell', 'strength'].includes(q.giver) && !!(q.details && q.details.routine);
    return `<div class="offer" style="margin:8px 0">
      <div><span class="o-title" style="font-size:20px">${esc(q.title)}</span>
        ${q.kind === 'rest' ? '' : modalityChip(q.details && q.details.modality, q.giver, q.details && q.details.program)}
        <span class="muted">— ${esc(st.givers[q.giver].name)}</span></div>
      <div class="${q.completable ? '' : 'muted'}" style="font-size:17px">${q.completable ? '&#10004; ' : ''}${esc(q.progress_note)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px">
        ${lifting ? `<button type="button" class="btn small" style="min-width:0" onclick="nav('logger',{quest:${q.id}})">LOG SETS</button>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button type="button" class="btn small" style="min-width:0" onclick="nav('giver',{giver:'${q.giver}'})">VISIT ${esc(st.givers[q.giver].name)}</button>
          ${q.completable ? `<button type="button" class="btn small green" style="min-width:0" onclick="G.complete(${q.id}, false)">TURN IN</button>` : ''}
          <button type="button" class="btn small danger" style="min-width:0" onclick="G.abandonQuick(${q.id})">ABANDON</button>
        </div>
      </div>
    </div>`;
  };

  SIEGE.current = siege;
  const siegeBanner = siege ? siegeBannerHtml(siege) : '';
  const devMode = !!S.state.settings?.dev_mode;

  $app().innerHTML = shell(`
    ${siegeBanner}
    ${st.active_quests.length ? `<div class="win tight"><span class="win-title">Sworn Quests</span>
      ${st.active_quests.map(questRow).join('')}
    </div>` : ''}
    <div class="town-scene tod-${effectiveTOD}">
      ${devMode ? `<button type="button" class="tod-toggle" aria-label="Cycle town time of day" title="dev: cycle time of day (${devTOD ? 'pinned: ' + devTOD : 'auto: ' + effectiveTOD})" onclick="G.cycleTOD()">${spriteTag(TOD_ICON[effectiveTOD], 22)}</button>` : ''}
      <div class="trow">
        ${bld('bld_waystone', g.running.name, GIVER_ROLES.running, `nav('giver',{giver:'running'})`, !!activeBy.running, 120, 'bld-fenn')}
        ${bld('bld_forge', g.kettlebell.name, GIVER_ROLES.kettlebell, `nav('giver',{giver:'kettlebell'})`, !!activeBy.kettlebell, 120, 'bld-grun')}
        ${bld('bld_keep', g.strength.name, GIVER_ROLES.strength, `nav('giver',{giver:'strength'})`, !!activeBy.strength, 120, 'bld-bram')}
        ${bld('bld_willow', g.mobility.name, GIVER_ROLES.mobility, `nav('giver',{giver:'mobility'})`, !!activeBy.mobility, 120, 'bld-elowen')}
      </div>
      <div class="road-h"></div>
      <div class="trow">
        ${bld('bld_ledger', 'The Ledger House', 'Wick: confess & amend', `nav('scrivener')`, false, 120, 'bld-wick')}
        ${bld('bld_hall', 'Hall of Records', 'stats, vitals & the Curator',
          st.almanac_unread ? `statsTab='almanac';nav('stats')` : `nav('stats')`, !!st.almanac_unread)}
        ${bld('crank', 'The Crankwerk', 'hats for the herd', `nav('crank')`)}
      </div>
      <div class="road-h"></div>
      <div class="trow">
        ${bld('bld_ranch', 'The Menagerie', 'your creatures graze here', `nav('ranch')`)}
        ${bld('bld_colosseum', 'The Colosseum', 'duels, races & pageants', `nav('colosseum')`)}
        ${bld('bld_gate', 'The Undercroft', st.dungeon_active ? 'expedition below!' : `descend — floor ${st.resume_floor}`, `nav('undercroft')`, st.dungeon_active)}
      </div>
    </div>
  `);
  scheduleTODRefresh();
};

/* ---- Deed bubbles: an unsworn deed pops out of the responsible giver's
   building (DEED_BUBBLES maps giver -> anchor/voice). The reward is NOT
   granted until this is actually tapped — see G.claimFennBubble, which hits
   /api/unguided/claim. S.fennQueue is a straight mirror of the server's
   current unclaimed-today list (see queueFennBubbles in app.js), so we
   reconcile against its head rather than blindly inserting: if a bubble is
   already showing but no longer matches (claimed elsewhere, or quietly
   auto-resolved by the server after a day passed), swap it out. ---- */
function showFennBubbleIfQueued() {
  const next = S.fennQueue && S.fennQueue[0];
  const shown = document.querySelector('.fenn-bubble-wrap:not(.willow-bubble-wrap)');
  if (shown) {
    if (next && shown.dataset.activityId === String(next.activity_id)) return; // already correct
    shown.remove();
  }
  if (!next) return;
  const deed = DEED_BUBBLES[next.giver] || DEED_BUBBLES.running;
  const anchor = document.getElementById(deed.anchor);
  if (!anchor) return;
  anchor.insertAdjacentHTML('beforeend', `
    <div class="fenn-bubble-wrap" data-activity-id="${esc(next.activity_id)}">
      <button type="button" class="fenn-bubble" style="width:100%;font:inherit;color:inherit;text-align:inherit" aria-label="Claim this deed's reward" onclick="G.claimFennBubble()">
        <span class="fb-line" style="display:block">&ldquo;${esc(pickLine(deed.lines))}&rdquo;</span>
        <span class="fb-rewards">
          <span style="color:var(--purple)">+${next.xp} XP</span>
          <span class="g">&#9670; +${next.gold}</span>
          <span style="color:var(--green)">+${next.vigor} vigor</span>
        </span>
        <span class="btn small green" aria-hidden="true" style="display:block;width:100%;box-sizing:border-box">${esc(deed.label)}</span>
      </button>
    </div>`);
  SFX.coin();
}

G.claimFennBubble = async () => {
  const routeToken = captureRouteToken();
  const b = S.fennQueue && S.fennQueue[0];
  if (!b) return;
  document.querySelectorAll('.fenn-bubble-wrap').forEach(x => x.remove());
  const rewards = await api('/unguided/claim', { method: 'POST', body: { activity_id: b.activity_id } });
  const requestStillCurrent = isRouteTokenCurrent(routeToken);
  await refreshState();
  if (!requestStillCurrent || !isRouteTokenCurrent(routeToken)) return;
  render();
  // NB: no token passed \u2014 showCeremony must default-capture AFTER render(),
  // which bumps viewGeneration. Passing the pre-render routeToken here made the
  // ceremony's own isRouteTokenCurrent guard fail every time and silently
  // swallowed the reward reveal. The guard above already covers navigation.
  showCeremony(rewards, rewards.quest_title || b.title || `A Deed Unsworn \u2014 ${b.minutes} min`);
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
      <button type="button" class="fenn-bubble willow" style="width:100%;font:inherit;color:inherit;text-align:inherit" aria-label="Read the willow's writ notice" onclick="G.ackWillowBubble()">
        <span class="fb-line" style="display:block">&ldquo;${kept ? 'The writ is kept. Rise rested \u2014 the Vale noticed.' : 'The iron called, and you answered. The willow does not scold.'}&rdquo;</span>
        ${kept ? `<span class="fb-rewards">
          <span style="color:var(--purple)">+${next.rewards.xp} XP</span>
          <span class="g">&#9670; +${next.rewards.gold}</span>
          <span style="color:#e07030">streak kept &middot; ${next.rewards.streak}</span>
        </span>` : ''}
        <span class="btn small ${kept ? 'green' : ''}" aria-hidden="true" style="display:block;width:100%;box-sizing:border-box">${kept ? 'WORD FROM THE WILLOW' : 'THE WRIT SLIPPED AWAY'}</span>
      </button>
    </div>`);
  SFX.coin();
}

G.ackWillowBubble = async () => {
  const routeToken = captureRouteToken();
  const b = S.writQueue && S.writQueue[0];
  if (!b) return;
  document.querySelectorAll('.willow-bubble-wrap').forEach(x => x.remove());
  const n = await api('/writ/ack', { method: 'POST', body: { ts: b.ts } });
  const requestStillCurrent = isRouteTokenCurrent(routeToken);
  await refreshState();
  if (!requestStillCurrent || !isRouteTokenCurrent(routeToken)) return;
  render();
  if (n.type === 'kept') {
    showCeremony(n.rewards, 'The Rest Writ \u2014 Kept');
  } else {
    SFX.accept();
    showModal(`<div class="win center" style="max-width:380px">
      <span class="win-title">The Writ Slipped Away</span>
      <p style="margin:10px 0">${esc(n.detail || 'Training')} broke the stillness. The willow bends; it does not break \u2014 and neither, apparently, do you.</p>
      <p class="muted" style="font-size:16px">No penalty. The omens will be read again tomorrow.</p>
      <button class="btn" onclick="G.closeOverlay(this.closest('.overlay'))">ONWARD</button>
    </div>`);
  }
};

/* ---- the siege banner: a small breathing preview by default; expands into a
   D&D-style monster card (no health bar) with an expandable war-party board ---- */

const SIEGE = { collapsed: true, leaderOpen: {}, current: null };
RESETS.push(() => { SIEGE.collapsed = true; SIEGE.leaderOpen = {}; SIEGE.current = null; });

function siegeBannerHtml(siege) {
  const pct = Math.max(0, Math.round(100 * siege.hp_left / siege.hp_max));
  const hpBar = `<span class="hpbar sg-hp" style="display:block"><i aria-hidden="true" style="display:block;height:100%;width:${pct}%;background:linear-gradient(0deg,#8c2020,#c85050);transition:width 0.25s"></i><span>${siege.hp_left} / ${siege.hp_max}</span></span>`;

  // COLLAPSED (default): just the beast breathing + a slim health bar
  if (SIEGE.collapsed) {
    return `<button type="button" class="siege-banner collapsed ${siege.defeated ? 'won' : ''}" style="width:calc(100% - 8px);font:inherit;color:inherit;text-align:left"
      aria-expanded="false" aria-label="Expand the Siege: ${esc(siege.name)}" title="expand the siege" onclick="G.siegeToggle()">
      <span class="sg-boss breathing">${bossTag(siege.dna, 44)}</span>
      <span class="sg-mini">
        <span class="sg-mini-name" style="display:block"><span class="r-legendary">${esc(siege.name)}</span> <span class="muted">${esc(siege.epithet)}</span></span>
        ${siege.defeated ? '<span class="sg-sub" style="display:block;color:var(--green)">FELLED — the town holds &middot; tap for spoils</span>' : hpBar}
      </span>
    </button>`;
  }

  // EXPANDED: the monster card — no health bar, just the stat block
  const trophyName = (S.itemsCatalog[siege.trophy] || {}).name || siege.trophy;
  const statLine = siege.defeated
    ? `<span style="color:var(--green)">FELLED — the town held</span>`
    : `<b style="color:var(--gold-bright)">${siege.dealt.toLocaleString()}</b> / ${siege.hp_max.toLocaleString()} damage dealt &middot; falls ${siege.days_left > 0 ? `in ${siege.days_left}d ${siege.hours_left % 24}h` : `in ${siege.hours_left}h`}`;

  const board = siege.contributors.length
    ? siege.contributors.map((x, i) => {
      const open = SIEGE.leaderOpen[i] === x.name;
      const blows = (x.blows || []).map(b =>
        `<div class="sg-blow"><span class="sg-blow-dmg">+${b.dmg}</span> ${esc(b.label)} <span class="muted">${b.ts.slice(5, 16).replace('T', ' ')}</span></div>`
      ).join('') || '<div class="muted" style="font-size:14px">no blows recorded</div>';
      return `<div class="sg-leader ${open ? 'open' : ''}">
        <button type="button" class="sg-leader-row" style="width:100%;border:0;font:inherit;color:inherit;text-align:left" onclick="G.siegeLeader(${i})" aria-expanded="${open}">
          <span class="sg-rank">${i + 1}</span>
          <span class="sg-leader-name">${esc(x.name)}${x.you ? ' <span class="muted">(you)</span>' : ''}</span>
          <span class="sg-leader-dmg">${x.damage.toLocaleString()}</span>
          <span class="sg-leader-caret">${open ? '&#9662;' : '&#9656;'}</span>
        </button>
        ${open ? `<div class="sg-blows">${blows}</div>` : ''}
      </div>`;
    }).join('')
    : '<div class="muted center" style="padding:6px">no blows struck yet — be the first to draw its ire</div>';

  return `<section class="siege-banner expanded ${siege.defeated ? 'won' : ''}" aria-label="The Siege: ${esc(siege.name)}" title="collapse the siege" onclick="G.siegeBoxToggle(event)">
    <button type="button" class="sg-collapse" onclick="G.siegeToggle()" aria-expanded="true" aria-label="Collapse the siege" title="collapse the siege">&#9652;</button>
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
      ${siege.defeated && !siege.claimed ? `<div class="center" style="margin:8px 0"><button type="button" class="btn wide green" onclick="G.raidClaim()">CLAIM YOUR SPOILS</button></div>` : ''}
      ${siege.defeated && siege.claimed ? '<div class="sg-sub muted center" style="margin:6px 0">spoils claimed &#10004; &middot; a new horror comes Monday</div>' : ''}
    </div>
    <div class="sg-divider"><span>&#9670; &#9670; &#9670;</span></div>
    <div class="sg-warparty">
      <div class="sg-board-title">THE WAR PARTY <span class="muted" style="font-size:13px">&mdash; tap a name for their blows</span></div>
      <div class="sg-board">${board}</div>
      <div class="muted" style="font-size:13px;margin-top:6px">1 active minute = 10 damage &middot; every adventurer's workouts count</div>
    </div>
  </section>`;
}

G.siegeToggle = () => {
  SIEGE.collapsed = !SIEGE.collapsed;
  SFX.click();
  render();
};

/* Clicking anywhere on the expanded card collapses it again — except its own
   controls (claim, collapse caret) and the leaderboard, which stays
   interactive for inspecting blows without surprise collapses. */
G.siegeBoxToggle = (event) => {
  // Exempt the whole war-party section (heading + board + footer), not just the
  // board rows — its instructional heading/footer are siblings of .sg-board, and
  // a mis-tap there shouldn't surprise-collapse the card.
  if (event.target.closest('button, .sg-warparty')) return;
  G.siegeToggle();
};

G.siegeLeader = (index) => {
  const contributor = SIEGE.current && SIEGE.current.contributors[index];
  if (!contributor) return;
  SIEGE.leaderOpen[index] = SIEGE.leaderOpen[index] === contributor.name ? null : contributor.name;
  SFX.click();
  render();
};

G.raidClaim = async () => {
  const routeToken = captureRouteToken();
  let r;
  let requestStillCurrent = false;
  try {
    r = await api('/raid/claim', { method: 'POST' });
    requestStillCurrent = isRouteTokenCurrent(routeToken);
  } catch (e) { return; }
  await refreshState();
  if (!requestStillCurrent || !isRouteTokenCurrent(routeToken)) return;
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
      <button class="btn big" style="width:auto" onclick="G.closeOverlay(this.closest('.overlay'),()=>nav('ranch'))">TO THE MENAGERIE</button>
      <button class="btn" onclick="G.closeOverlay(this.closest('.overlay'),render)">GLORY</button>
    </div>
  </div>`, { backdropClose: false });
  if (cap) {
    let stopDepartureWatch = () => {};
    stopDepartureWatch = watchRouteDeparture(routeToken, () => {
      document.body.classList.remove('megashake');
      stopDepartureWatch();
    });
    document.body.classList.add('megashake');
    const shakeTimer = setTimeout(() => {
      appRouteTimers.delete(shakeTimer);
      stopDepartureWatch();
      if (!isRouteTokenCurrent(routeToken)) return;
      document.body.classList.remove('megashake');
    }, 700);
    appRouteTimers.add(shakeTimer);
  }
};

G.abandonQuick = async (id) => {
  const routeToken = captureRouteToken();
  if (!await confirmModal('Abandon this quest? The Vale forgives; the ledger remembers.',
      { title: 'Abandon the quest?', okLabel: 'ABANDON', danger: true })) return;
  await api(`/quests/${id}/abandon`, { method: 'POST' });
  const requestStillCurrent = isRouteTokenCurrent(routeToken);
  await refreshState();
  if (!requestStillCurrent || !isRouteTokenCurrent(routeToken)) return;
  toast('The oath is released.');
  render();
};

G.syncNow = async () => {
  const routeToken = captureRouteToken();
  toast('Ravens away...');
  const routeToast = document.querySelector('.toast');
  let stopDepartureWatch = () => {};
  stopDepartureWatch = watchRouteDeparture(routeToken, () => {
    if (routeToast && routeToast.isConnected) routeToast.remove();
    stopDepartureWatch();
  });
  let r;
  let requestStillCurrent = false;
  try {
    r = await api('/sync', { method: 'POST' });
    requestStillCurrent = isRouteTokenCurrent(routeToken);
    await refreshState();
  } finally {
    stopDepartureWatch();
  }
  if (r.completed && r.completed.length) {
    r.completed.forEach(q => recordQuestDone(q.title, q.giver));
  }
  if (!requestStillCurrent || !isRouteTokenCurrent(routeToken)) return;
  render();
  if (r.completed && r.completed.length) {
    // Re-capture after render(): the pre-render routeToken is already stale
    // (render bumps viewGeneration), which would fail both this guard and
    // showCeremony's, swallowing every synced-quest ceremony.
    const ceremonyToken = captureRouteToken();
    r.completed.forEach((q, i) => {
      const ceremonyTimer = setTimeout(() => {
        appRouteTimers.delete(ceremonyTimer);
        if (!isRouteTokenCurrent(ceremonyToken)) return;
        showCeremony(q.rewards, q.title, ceremonyToken);
      }, i * 400);
      appRouteTimers.add(ceremonyTimer);
    });
  } else if (r.raid_damage) {
    toast(`${r.new_activities} new deed(s) — you strike the siege for ${r.raid_damage}!`);
  } else {
    toast(`${r.new_activities} new deed(s) returned.`);
  }
};
