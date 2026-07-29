/* The quest-giver screens: giver dialogue and offers, doctrines &
   routines, the training logger, and Wick the Scrivener. */
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
  running: 'Quests of the Long Way',
  kettlebell: 'Quests of Strength',
  strength: 'Quests of the Unburdened',
  mobility: 'Quests of Stillness',
};

let giverResponsiveQuery = null;
let giverResponsiveListener = null;

function giverPhoneLayout() {
  if (giverResponsiveQuery) return giverResponsiveQuery.matches;
  if (window.matchMedia) {
    giverResponsiveQuery = window.matchMedia('(max-width: 719px)');
    return giverResponsiveQuery.matches;
  }
  return window.innerWidth <= 719;
}

function syncGiverResponsiveLayout(phone = giverPhoneLayout()) {
  const app = $app();
  if (!app || S.screen !== 'giver') return;
  const dialogue = app.querySelector('.giver-dialogue');
  const panel = app.querySelector('.giver-offer-panel');
  if (!dialogue || !panel || dialogue.parentNode !== panel.parentNode) return;

  if (phone) {
    if (panel.nextElementSibling !== dialogue) panel.parentNode.insertBefore(panel, dialogue);
  } else if (dialogue.nextElementSibling !== panel) {
    panel.parentNode.insertBefore(dialogue, panel);
  }
  panel.querySelectorAll('.phone-disclosure.offer-lore').forEach(detail => {
    detail.open = !phone;
  });
}

function bindGiverResponsiveListener() {
  if (giverResponsiveListener || !window.matchMedia) return;
  const media = giverResponsiveQuery || window.matchMedia('(max-width: 719px)');
  giverResponsiveQuery = media;
  giverResponsiveListener = () => syncGiverResponsiveLayout(media.matches);
  if (media.addEventListener) media.addEventListener('change', giverResponsiveListener);
  else if (media.addListener) media.addListener(giverResponsiveListener);
}

const COUNSEL_REASON_COPY = {
  cold_start: 'The counsel is still learning this trail, so the target begins gently.',
  no_iron_history: 'No Iron sessions are written in the ledger yet, so this is a generic starter.',
  wellness_data_missing: 'No current wellness omens have reached the Vale.',
  wellness_data_stale: 'The latest wellness omens are too old to guide a hard path.',
  wellness_data_mixed: 'Only part of the latest wellness record is current.',
  hard_suppressed_wellness_unknown: 'Without clear omens, the counsel favors a steadier path.',
  wellness_trend_low_hrv: 'Today’s recovery measure sits below its recent range.',
  wellness_trend_high_resting_hr: 'Today’s resting pulse sits above its recent range.',
  hard_suppressed_wellness_trend: 'Together, those omens steer the counsel away from hard work.',
  recent_lower_body_six_sets: 'Recent lower-body Iron still weighs on the legs.',
  hard_option_suppressed: 'A harder path was set aside for today.',
  hard_option_wellness_warning: 'This harder path remains yours to choose, but the omens advise caution.',
  equipment_today: 'Grunhilda kept this path to the iron you named for today.',
  doctrine_equipment_mismatch: 'Your selected doctrine calls for other iron, so it waits unchanged for another day.',
};

function counselReasonText(code) {
  return COUNSEL_REASON_COPY[code]
    || String(code || '').replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
}

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

/* ================= QUEST GIVER ================= */

SCREENS.giver = async function () {
  const token = captureRouteToken();
  const key = S.params.giver;
  const g = S.state.givers[key];
  const data = await api(`/offers/${key}`);
  if (!isRouteTokenCurrent(token)) return;
  let line;
  if (S.params.react) line = pickLine(REACTIONS[S.params.react][key]);
  else line = congratLine(key) || (S.state.npc_notices || {})[key] || pickLine(GREETINGS[key]);
  const isLiftGiver = ['kettlebell', 'strength'].includes(key);
  const isIronGiver = key === 'kettlebell';
  const revealOfferLore = !giverPhoneLayout();

  const rewardsLine = (o) => `<div class="o-rewards">reward: <b>+${o.xp} XP</b> &middot; <span class="g">&#9670;${o.gold}+</span> &middot; +${o.vigor} vigor${o.bonus_vigor ? ' (+1 bonus)' : ''}</div>`;

  const routineLine = (r) => {
    const unit = ['seconds', 'steps'].includes(r.unit) ? ` ${r.unit}` : '';
    return `&#9656; ${esc(r.exercise)} — ${r.sets}&times;${r.reps}${unit}${r.suggest_weight ? ` @ ${r.suggest_weight}` : ''}`;
  };

  // the omens Elowen read — shown on a rest-writ offer and on the sworn writ
  const omensBlock = (d) => (d.reasons && d.reasons.length) ? `
    <div class="omens">
      <div class="omens-title">THE OMENS</div>
      ${d.reasons.map(r => `<div class="omen-line">&#9656; ${esc(r)}</div>`).join('')}
    </div>` : '';

  const counselDetails = (o) => {
    const reasonCodes = Array.isArray(o.reason_codes) ? o.reason_codes : [];
    const reasons = reasonCodes.length
      ? reasonCodes.map(code => `<div class="counsel-reason">&#9656; ${esc(counselReasonText(code))}</div>`).join('')
      : '<div class="counsel-reason">No extra caution was attached to this path.</div>';
    const source = o.source && typeof o.source === 'object' ? o.source : {};
    const provider = source.provider || source.activity_source || 'not recorded';
    const activityAsOf = source.activity_as_of || 'no synced activity yet';
    const wellnessAsOf = source.wellness_as_of || 'no wellness reading yet';
    const freshness = source.wellness_freshness
      ? String(source.wellness_freshness).replaceAll('_', ' ')
      : 'not recorded';
    return `<details class="phone-disclosure offer-lore counsel-detail" ${revealOfferLore ? 'open' : ''}>
      <summary>WHY THIS PATH</summary>
      <div class="phone-disclosure-content">
        <div class="counsel-block giver-counsel-block">
          <span class="counsel-label">WHY THIS PATH</span>
          <div class="counsel-reasons">${reasons}</div>
          <span class="counsel-label">PROVIDER &amp; AS-OF</span>
          <div class="counsel-source">
            <span>provider: ${esc(provider)}</span>
            <span>activity as of: ${esc(activityAsOf)}</span>
            <span>wellness as of: ${esc(wellnessAsOf)}</span>
            <span>wellness record: ${esc(freshness)}</span>
          </div>
        </div>
        ${o.blurb ? `<div class="giver-offer-lore muted">&ldquo;${esc(o.blurb)}&rdquo;</div>` : ''}
        ${o.kind === 'rest' ? omensBlock(o) : ''}
        ${o.focus ? `<div class="center giver-focus-map">${bodyMapTag(o.focus, 78)}</div>` : ''}
      </div>
    </details>`;
  };

  const offerCard = (o) => {
    const routine = o.routine ? `<div class="o-struct">${o.routine.map(routineLine).join('<br>')}</div>` : '';
    const isWrit = o.kind === 'rest';
    const warning = o.wellness_warning
      ? '<div class="counsel-eligibility warn" role="note">The omens do not favor hard work today. This path remains yours to choose.</div>'
      : '<div class="counsel-eligibility">Eligible today.</div>';
    return `<div class="offer counsel-path-card ${isWrit ? 'writ' : ''} ${o.wellness_warning ? 'has-wellness-warning' : ''}"
        data-offer-id="${Number(o.offer_id)}" data-tier-label="${esc(o.tier_label)}">
      <div class="offer-primary">
        <div class="counsel-tier-row">
          <span class="counsel-tier-label">${esc(o.tier_label)}</span>
          <span class="counsel-tier-detail">${esc(o.tier_detail)}</span>
        </div>
        <div><span class="o-title">${esc(o.title)}</span>
          ${o.program ? '<span class="chip program">DOCTRINE</span>' : ''}
          ${modalityChip(o.modality, o.giver, o.program)}
          ${isWrit ? '<span class="chip rest">REST WRIT</span>' : `<span class="chip ${o.intensity}">${o.intensity}</span>`}
          ${o.target_minutes ? `<span class="o-kind">~${o.target_minutes} min</span>` : ''}</div>
        <div class="o-struct">${esc(o.structure)}</div>
        ${routine}
        ${rewardsLine(o)}
        ${isWrit ? '<div class="o-rewards" style="color:var(--green)">and the streak keeps itself tonight — rest counts</div>' : ''}
        ${warning}
        <div class="giver-accept-row">
          <button class="btn" onclick="G.accept('${key}',${Number(o.offer_id)})">${isWrit ? 'SWEAR THE WRIT' : 'ACCEPT QUEST'}</button>
        </div>
        ${counselDetails(o)}
      </div>
    </div>`;
  };

  let body;
  if (data.active) {
    const q = data.active;
    const isWrit = q.kind === 'rest';
    const activeTier = q.details.tier_label ? `
      <div class="counsel-tier-row">
        <span class="counsel-tier-label">${esc(q.details.tier_label)}</span>
        <span class="counsel-tier-detail">${esc(q.details.tier_detail)}</span>
      </div>` : '';
    body = `<div class="win giver-offer-panel"><span class="win-title">${isWrit ? 'Your Sworn Writ' : 'Your Sworn Quest'}</span>
      <div class="offer ${isWrit ? 'writ' : ''}">
        <div class="offer-primary">
          ${activeTier}
          <div><span class="o-title">${esc(q.title)}</span>
            ${isWrit ? '' : modalityChip(q.details.modality, q.giver, q.details.program)}
            ${isWrit ? '<span class="chip rest">REST WRIT</span>' : `<span class="chip ${q.details.intensity}">${q.details.intensity}</span>`}</div>
          <div class="o-struct">${esc(q.details.structure)}</div>
          ${q.details.routine ? `<div class="o-struct">${q.details.routine.map(routineLine).join('<br>')}</div>` : ''}
          ${rewardsLine(q.details)}
          <div class="${q.completable ? '' : 'muted'}" style="margin:6px 0">${q.completable ? '&#10004; ' : ''}${esc(q.progress_note)}</div>
          ${q.details.focus ? `<div class="center" style="margin:6px 0">${bodyMapTag(q.details.focus, 78)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            ${isLiftGiver && q.details.routine ? `<button class="btn" onclick="nav('logger',{quest:${q.id}})">OPEN TRAINING LOG</button>` : ''}
            ${q.giver === 'running' || q.details.modality === 'climb' ? `<button class="btn" onclick="G.syncThenBack('${key}')">SYNC ${({run:'RUNS',ride:'RIDES',swim:'SWIMS',climb:'THE WALL'})[q.details.modality] || 'RUNS'}</button>` : ''}
            ${isWrit ? ''
              : q.completable
                ? `<button class="btn green" onclick="G.complete(${q.id}, false)">TURN IN QUEST</button>`
                : `<button class="btn" onclick="G.completeHonor(${q.id})">COMPLETE ON HONOR</button>`}
            <button class="btn danger small" style="min-width:0" onclick="G.abandon(${q.id}, '${key}')">${isWrit ? 'set the writ aside' : 'abandon'}</button>
          </div>
          ${q.details.counsel_mode ? counselDetails(q.details) : ''}
        </div>
        ${isWrit && !q.details.counsel_mode && q.details.reasons && q.details.reasons.length ? `<details class="phone-disclosure offer-lore" ${revealOfferLore ? 'open' : ''}>
          <summary>READ THE SIGNS</summary>
          <div class="phone-disclosure-content">
            ${omensBlock(q.details)}
          </div>
        </details>` : ''}
      </div>
    </div>`;
  } else {
    const mode = data.offers[0]?.counsel_mode || S.state.settings?.counsel_mode || 'considered';
    const boardTitle = mode === 'self' ? 'Choose Your Path' : 'Today’s Considered Path';
    const boardHelp = mode === 'self'
      ? 'The counsel lays out each eligible effort. The choice remains yours.'
      : 'One eligible path, chosen from this giver’s work for today.';
    const selectedIron = S.state.settings?.counsel_iron_today?.equipment || '';
    const selectedIronLabel = selectedIron || 'any iron';
    // The day constraint stays inside Grunhilda's server-owned modalities;
    // the empty choice clears it instead of naming another implement.
    const ironTodayOptions = [
      { value: '', label: 'any iron' },
      ...(Array.isArray(data.modalities) ? data.modalities : [])
        .map(equipment => ({ value: equipment, label: equipment })),
    ];
    const ironTodayControl = isIronGiver ? `
      <div class="iron-today-control">
        ${pixelSelect(
          'iron-today-equipment',
          ironTodayOptions,
          selectedIron,
          `Iron available today: ${selectedIronLabel}`,
          'setIronToday',
        )}
      </div>` : '';
    body = `<div class="win counsel-surface giver-offer-panel giver-offer-board" data-counsel-mode="${esc(mode)}" data-giver="${esc(key)}">
      <span class="win-title">${boardTitle}</span>
      <div class="giver-board-intro">${boardHelp}</div>
      ${ironTodayControl}
      ${data.offers.map(offerCard).join('')}
      <div class="giver-board-actions">
        ${isLiftGiver ? `<button class="btn small" style="min-width:0" onclick="nav('doctrines',{giver:'${key}'})">DOCTRINES &amp; ROUTINES</button>` : ''}
      </div>
    </div>`;
  }

  const dialogue = `
    <div class="win giver-dialogue">
      <div class="npc-head">
        ${portraitTag(g.sprite, 128)}
        <div class="dialog"><div class="npc-name">${esc(g.name)} ${esc(g.title)}</div><div id="dlg"></div></div>
      </div>
    </div>`;
  bindGiverResponsiveListener();
  $app().innerHTML = shell(revealOfferLore ? `${dialogue}${body}` : `${body}${dialogue}`);
  syncGiverResponsiveLayout();
  typewrite(document.getElementById('dlg'), line, 14, npcPortraitEl());
};

G.accept = async (giver, offerId) => {
  const token = captureRouteToken();
  await api('/quests/accept', { method: 'POST', body: { giver, offer_id: offerId } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  SFX.accept();
  S.params = { giver, react: 'accept' };
  render();
  toast('The oath is inked. Your quest is sworn.');
};

G.setIronToday = async (equipment) => {
  const token = captureRouteToken();
  let declaration = null;
  if (equipment) {
    const current = await api('/today');
    declaration = { date: current.today, equipment };
  }
  await api('/settings', {
    method: 'POST',
    body: { counsel_iron_today: declaration },
  });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  render();
  toast(equipment
    ? `Grunhilda has marked ${equipment} for today.`
    : 'Grunhilda may choose from every iron again.');
};

G.abandon = async (id, giver) => {
  if (!await confirmModal('Abandon this quest? The Vale forgives; the ledger remembers.',
      { title: 'Abandon the quest?', okLabel: 'ABANDON', danger: true })) return;
  const token = captureRouteToken();
  await api(`/quests/${id}/abandon`, { method: 'POST' });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  S.params = { giver, react: 'abandon' };
  render();
};

/* NOTE: handlers take only the quest id — titles contain apostrophes that
   detonate inside inline onclick strings ("The Courier's Route", RIP). */
G.complete = async (id, honor) => {
  const token = captureRouteToken();
  const q = S.state.active_quests.find(x => x.id === id);
  const title = q ? q.title : 'A Deed';
  const giver = q ? q.giver : null;
  const r = await api(`/quests/${id}/complete`, { method: 'POST', body: { honor } });
  await refreshState();
  recordQuestDone(title, giver);
  if (!isRouteTokenCurrent(token)) return;
  if (giver && S.screen === 'giver') S.params = { giver, react: 'complete' };
  render();
  showCeremony(r.rewards, title);
};

G.completeHonor = async (id) => {
  // With a tracker linked, honoring too early is the one path that can
  // double-record a workout: honor writes a synthetic deed NOW, and the
  // ravens may deliver the real one later (it also strikes the Siege
  // twice). Nudge toward syncing first; honor stays one tap away.
  const message = S.state?.settings?.intervals_api_key
    ? 'No matching record found. If your tracker logged this deed, SEND RAVENS first — swearing now records it by hand, and the ravens may bring a second copy later.'
    : 'No matching record found. Swear on your honor that the deed is done?';
  if (await confirmModal(message, { title: 'On your honor?', okLabel: 'I SWEAR IT' })) {
    G.complete(id, true);
  }
};

G.syncThenBack = async (giver) => {
  const token = captureRouteToken();
  toast('Ravens away...');
  const r = await api('/sync', { method: 'POST' });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  if (r.completed && r.completed.length) {
    S.params = { giver, react: 'complete' };
    render();
    r.completed.forEach((q, i) => {
      recordQuestDone(q.title, q.giver);
      setTimeout(() => {
        if (isRouteTokenCurrent(token)) showCeremony(q.rewards, q.title);
      }, i * 400);
    });
  } else {
    S.params = { giver };
    render();
  }
};

/* ================= DOCTRINES (programs & routines) ================= */

const RB = { exercises: [] }; // routine builder state
RESETS.push(() => { RB.exercises = []; });

SCREENS.doctrines = async function () {
  const token = captureRouteToken();
  const giver = S.params.giver;
  const d = await api('/programs');
  if (!isRouteTokenCurrent(token)) return;
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
          <div style="flex:1;min-width:160px">${pixelSelect('rb-ex',
            giverExs.map(e => ({ value: e.name, label: e.name })),
            giverExs.length ? giverExs[0].name : '', 'exercise to add')}</div>
          <input type="number" id="rb-sets" value="3" style="width:64px" title="sets">
          <span class="muted">&times;</span>
          <input type="number" id="rb-reps" value="8" style="width:64px" title="reps">
          <button class="btn small" style="min-width:0" onclick="G.rbAdd()">ADD</button>
        </div>
      </div>
      <div id="rb-list" class="loglist">${RB.exercises.map((e, i) =>
        `<div><b>${esc(e.exercise)}</b> ${e.sets}&times;${e.reps}
         <button class="btn small danger" style="min-width:0;padding:0 8px" onclick="G.rbRemove(${i})">x</button></div>`).join('')}</div>
      <button class="btn wide green" style="margin-top:8px" onclick="G.rbSave('${giver}')">FORGE ROUTINE</button>
    </div>
  `);
};

G.selectProgram = async (giver, key) => {
  const token = captureRouteToken();
  await api('/programs/select', { method: 'POST', body: { giver, key } });
  if (!isRouteTokenCurrent(token)) return;
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
  const token = captureRouteToken();
  const name = document.getElementById('rb-name').value;
  await api('/routines', { method: 'POST', body: { name, giver, exercises: RB.exercises } });
  if (!isRouteTokenCurrent(token)) return;
  RB.exercises = []; RB.name = '';
  SFX.fanfare();
  toast('Routine forged.');
  render();
};

G.deleteRoutine = async (rid, giver) => {
  if (!await confirmModal('Burn this routine? This cannot be undone.',
      { title: 'Burn the routine?', okLabel: 'BURN IT', danger: true })) return;
  const token = captureRouteToken();
  await api(`/routines/${rid}`, { method: 'DELETE' });
  if (!isRouteTokenCurrent(token)) return;
  render();
};

/* ================= QUEST TRAINING LOG ================= */

const LIFT_UNITS = ['reps', 'seconds', 'steps'];
const MAX_LIFT_WEIGHT = 1000000;
const L = {
  questId: null, token: 0, routine: [], recent: [], today: '', todayCount: 0,
  weights: {}, counts: {}, units: {}, showHow: {}, open: {}, busy: {}, records: new Map(),
  pendingIds: new Set(), editor: null, focusCleanups: [],
};
const W = { sets: [], activitiesCount: 0 };
let liftEditorSequence = 0;

function clearLiftFocusPairs() {
  L.focusCleanups.forEach(cleanup => cleanup());
  L.focusCleanups = [];
}

function resetLiftState() {
  clearLiftFocusPairs();
  L.questId = null;
  L.token = 0;
  L.routine = [];
  L.recent = [];
  L.today = '';
  L.todayCount = 0;
  L.weights = {};
  L.counts = {};
  L.units = {};
  L.showHow = {};
  L.open = {};
  L.busy = {};
  L.records.clear();
  L.pendingIds.clear();
  L.editor = null;
  W.sets = [];
  W.activitiesCount = 0;
}
RESETS.push(resetLiftState);

G.liftUnit = (set) => LIFT_UNITS.includes(set && set.unit) ? set.unit : 'reps';
G.formatLift = (set, weightUnit = S.state.settings.weight_unit) => {
  const unit = G.liftUnit(set);
  if (unit === 'seconds') return `${set.reps} seconds`;
  return `${set.weight}${weightUnit} × ${set.reps} ${unit}`;
};

function rememberLiftRecord(set) {
  if (set && Number.isInteger(set.id)) L.records.set(set.id, set);
  return set;
}

function parseLiftNumber(raw, label, whole) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, message: `Record the ${label.toLowerCase()} before the set is logged.` };
  const numeric = Number(text);
  if (numeric < 0) return { ok: false, message: `${label} cannot fall below zero.` };
  if (!/^[+]?\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(numeric)) {
    return { ok: false, message: `${label} must be a plain, finite number.` };
  }
  if (whole && !Number.isInteger(numeric)) return { ok: false, message: `${label} must be a whole number.` };
  return { ok: true, value: numeric };
}

function liftValues(unit, weightRaw, countRaw) {
  const countLabel = unit[0].toUpperCase() + unit.slice(1);
  const count = parseLiftNumber(countRaw, countLabel, true);
  if (!count.ok) return { ok: false, field: 'count', message: count.message };
  if (count.value > 2147483647) {
    return { ok: false, field: 'count', message: 'That set count is too large for the ledger.' };
  }
  if (unit === 'seconds') return { ok: true, weight: 0, reps: count.value };
  const weight = parseLiftNumber(weightRaw, 'Weight', false);
  if (!weight.ok) return { ok: false, field: 'weight', message: weight.message };
  if (weight.value > MAX_LIFT_WEIGHT) {
    return { ok: false, field: 'weight', message: 'That weight is too large for the ledger.' };
  }
  if (!Number.isFinite(weight.value * count.value)) {
    return { ok: false, field: 'weight', message: 'That set is too large for the ledger.' };
  }
  return { ok: true, weight: weight.value, reps: count.value };
}

function routineUnit(row) {
  if (LIFT_UNITS.includes(row.unit)) return row.unit;
  const catalog = S.exercises.find(exercise => exercise.name === row.exercise);
  return catalog && LIFT_UNITS.includes(catalog.unit) ? catalog.unit : 'reps';
}

function loggerDone(index) {
  const row = L.routine[index];
  return row ? L.recent.filter(set => set.quest_id === L.questId && set.exercise === row.exercise).length : 0;
}

function loggerDots(index) {
  const row = L.routine[index];
  const done = loggerDone(index);
  return Array.from({ length: row.sets }, (_, dot) =>
    `<span class="${dot < done ? 'done' : 'todo'}">&#9632;</span>`).join('');
}

function updateLoggerProgress(index) {
  const row = L.routine[index];
  if (!row) return;
  const done = loggerDone(index);
  const dots = document.getElementById(`logger-dots-${index}`);
  const progress = document.getElementById(`logger-progress-${index}`);
  if (dots) dots.innerHTML = loggerDots(index);
  if (progress) progress.textContent = `${done}/${row.sets}`;
}

function todaysLifts() {
  return L.recent.filter(set => set.ts.slice(0, 10) === L.today);
}

function liftRowMarkup(set, newest) {
  rememberLiftRecord(set);
  return `<div class="logger-recent-row" data-lift-id="${set.id}">
    <span><b>${esc(set.exercise)}</b> — ${esc(G.formatLift(set))} <span class="muted">${set.ts.slice(11, 16)}</span></span>
    <button class="btn small" style="min-width:0;padding:0 8px" onclick="G.editSet(${set.id})">fix</button>
    ${newest ? `<button class="btn small danger" style="min-width:0;padding:0 8px" onclick="G.undoSet(${set.id})">undo</button>` : ''}
  </div>`;
}

function paintTodaysLifts() {
  const sets = todaysLifts();
  const title = document.getElementById('logger-today-title');
  const list = document.getElementById('logger-today-list');
  if (title) title.textContent = `Today's Iron (${L.todayCount} sets)`;
  if (list) list.innerHTML = sets.length
    ? sets.map((set, index) => liftRowMarkup(set, index === 0)).join('')
    : '<span class="muted">Nothing yet. The bell is patient.</span>';
}

function loggerError(index, message, field) {
  const card = document.getElementById(`logger-card-${index}`);
  const error = document.getElementById(`logger-error-${index}`);
  card && card.classList.toggle('has-error', !!message);
  ['weight', 'count'].forEach(name => {
    const input = document.getElementById(`logger-${name}-${index}`);
    if (input) input.setAttribute('aria-invalid', String(!!message && name === field));
  });
  if (error) error.textContent = message || '';
  if (message) {
    const input = document.getElementById(`logger-${field}-${index}`);
    if (input) input.focus({ preventScroll: true });
  }
}

function setLoggerBusy(index, busy) {
  L.busy[index] = busy;
  const card = document.getElementById(`logger-card-${index}`);
  const save = document.getElementById(`logger-save-${index}`);
  const label = document.getElementById(`logger-save-label-${index}`);
  if (card) {
    card.classList.toggle('is-saving', busy);
    card.setAttribute('aria-busy', String(busy));
  }
  if (save) {
    save.disabled = busy;
  }
  if (label) label.textContent = busy ? 'INKING SET...' : 'LOG SET';
}

function loggerField(row, index, field) {
  const unit = L.units[index];
  const isWeight = field === 'weight';
  const value = isWeight ? L.weights[index] : L.counts[index];
  const label = isWeight ? `Weight (${S.state.settings.weight_unit})` : unit[0].toUpperCase() + unit.slice(1);
  const safeLabel = esc(label);
  const delta = isWeight ? 2.5 : 1;
  return `<div class="logger-field-row">
    <label for="logger-${field}-${index}">${safeLabel}</label>
    <button type="button" class="btn logger-step" aria-label="Decrease ${safeLabel}" onclick="G.adjustLogger(${index},'${field}',-${delta})">&minus;</button>
    <input class="logger-input" id="logger-${field}-${index}" type="number" min="0" step="${isWeight ? '0.1' : '1'}"
      inputmode="${isWeight ? 'decimal' : 'numeric'}" value="${value}" aria-describedby="logger-error-${index}"
      oninput="G.rememberLoggerInput(${index},'${field}',this)">
    <button type="button" class="btn logger-step" aria-label="Increase ${safeLabel}" onclick="G.adjustLogger(${index},'${field}',${delta})">+</button>
  </div>`;
}

function loggerCard(row, index) {
  const unit = L.units[index];
  const how = (S.exercises.find(exercise => exercise.name === row.exercise) || {}).how;
  const targetUnit = unit === 'reps' ? 'reps' : unit;
  return `<details class="logger-card" id="logger-card-${index}" ${L.open[index] ? 'open' : ''}
      ontoggle="G.rememberLoggerOpen(${index},this.open)">
    <summary class="logger-summary" onclick="G.loggerSummaryTap()">
      <span class="logger-ex"><span class="ex-name">${esc(row.exercise)}</span>${how ? `
        <button type="button" class="logger-how-btn" aria-label="Form cues for ${esc(row.exercise)}" aria-expanded="false" onclick="event.stopPropagation();event.preventDefault();G.toggleLoggerHow(${index})">?</button>` : ''}
        <span class="ex-target">${row.sets}&times;${row.reps} ${targetUnit}</span></span>
      <span class="setdots" id="logger-dots-${index}">${loggerDots(index)}</span>
    </summary>
    <div class="logger-card-body">
      <div class="muted logger-groups" style="font-size:16px">${(row.groups || []).map(esc).join(' / ')}</div>
      ${how ? `<div class="muted" id="logger-how-${index}" hidden style="font-size:17px;border-left:2px solid var(--gold);padding-left:8px;margin:6px 0">${esc(how)}</div>` : ''}
      <div class="logger-fields">
        ${unit === 'seconds' ? '' : loggerField(row, index, 'weight')}
        ${loggerField(row, index, 'count')}
      </div>
      <div class="logger-error" id="logger-error-${index}" role="alert"></div>
      <button class="btn big green logger-save" id="logger-save-${index}" onclick="G.logSet(${index})">
        <span id="logger-save-label-${index}">LOG SET</span> (<span id="logger-progress-${index}">${loggerDone(index)}/${row.sets}</span>)
      </button>
      <div class="logger-feedback" id="logger-feedback-${index}" aria-live="polite"></div>
    </div>
  </details>`;
}

SCREENS.logger = async function () {
  const token = captureRouteToken();
  const questId = S.params.quest || null;
  const quest = questId ? S.state.active_quests.find(candidate => candidate.id === questId) : null;
  if (!quest) {
    $app().innerHTML = shell(`<div class="win center">
      <p class="muted">No quest in hand. Accept one from Grunhilda or Ser Bram first.</p>
    </div>`);
    return;
  }
  const [recentPayload, todayPayload] = await Promise.all([
    api('/lifts/recent?limit=100'),
    api('/today'),
  ]);
  if (!isRouteTokenCurrent(token)) return;

  L.questId = questId;
  L.token = token;
  L.routine = quest.details.routine || [];
  L.recent = recentPayload.sets;
  L.today = todayPayload.today;
  L.todayCount = todaysLifts().length;
  L.weights = {};
  L.counts = {};
  L.units = {};
  L.showHow = {};
  L.open = {};
  L.busy = {};
  L.editor = null;
  L.records.clear();
  L.recent.forEach(rememberLiftRecord);

  let firstIncomplete = L.routine.findIndex((row, index) => loggerDone(index) < row.sets);
  if (firstIncomplete < 0) firstIncomplete = 0;
  const compact = window.matchMedia('(max-width: 719px)').matches;
  L.routine.forEach((row, index) => {
    L.units[index] = routineUnit(row);
    L.weights[index] = row.suggest_weight ?? 0;
    L.counts[index] = row.reps;
    L.open[index] = compact ? index === firstIncomplete : true;
  });

  $app().innerHTML = shell(`
    <div class="win logger-workout-win"><span class="win-title">Quest: ${esc(quest.title)}</span>
      <div class="muted">${esc(quest.details.structure)}</div>
      ${L.routine.map(loggerCard).join('')}
      <div class="center" style="margin-top:8px">
        <button class="btn wide green" onclick="nav('giver',{giver:'${quest.giver}'})">
          DONE — SEE ${esc(S.state.givers[quest.giver].name).toUpperCase()}
        </button>
      </div>
    </div>
    <div class="win"><span class="win-title" id="logger-today-title"></span>
      <div class="loglist" id="logger-today-list"></div>
    </div>
  `);
  clearLiftFocusPairs();
  L.routine.forEach((row, index) => {
    if (routineUnit(row) !== 'seconds') {
      L.focusCleanups.push(bindFormFocusPair(`#logger-weight-${index}`, `#logger-save-${index}`));
    }
    L.focusCleanups.push(bindFormFocusPair(`#logger-count-${index}`, `#logger-save-${index}`));
  });
  paintTodaysLifts();
};

G.loggerSummaryTap = () => {};
G.rememberLoggerOpen = (index, open) => { L.open[index] = open; };
G.toggleLoggerHow = (index) => {
  const how = document.getElementById(`logger-how-${index}`);
  if (!how) return;
  const card = document.getElementById(`logger-card-${index}`);
  if (card && !card.open) {
    // On a collapsed card the cues live inside the hidden body — open the
    // card with the cues showing instead of toggling something invisible.
    card.open = true;
    L.showHow[index] = true;
  } else {
    L.showHow[index] = how.hidden;
  }
  how.hidden = !L.showHow[index];
  const cue = document.querySelector(`#logger-card-${index} .logger-how-btn`);
  if (cue) cue.setAttribute('aria-expanded', String(L.showHow[index]));
};

G.rememberLoggerInput = (index, field, input) => {
  const unit = L.units[index];
  const parsed = field === 'weight'
    ? parseLiftNumber(input.value, 'Weight', false)
    : parseLiftNumber(input.value, unit[0].toUpperCase() + unit.slice(1), true);
  if (parsed.ok) {
    if (field === 'weight') L.weights[index] = parsed.value;
    else L.counts[index] = parsed.value;
  }
  loggerError(index, '', field);
};

G.adjustLogger = (index, field, delta) => {
  const input = document.getElementById(`logger-${field}-${index}`);
  if (!input) return;
  const whole = field === 'count';
  const label = whole ? L.units[index] : 'Weight';
  const parsed = parseLiftNumber(input.value, label, whole);
  const fallback = whole ? L.counts[index] : L.weights[index];
  const next = Math.max(0, (parsed.ok ? parsed.value : fallback) + delta);
  const value = whole ? Math.round(next) : Math.round(next * 10) / 10;
  input.value = value;
  if (whole) L.counts[index] = value;
  else L.weights[index] = value;
  loggerError(index, '', field);
};

G.logSet = async (index) => {
  if (L.busy[index] || !isRouteTokenCurrent(L.token)) return;
  const row = L.routine[index];
  if (!row) return;
  const unit = L.units[index];
  const weight = document.getElementById(`logger-weight-${index}`);
  const count = document.getElementById(`logger-count-${index}`);
  const values = liftValues(unit, weight ? weight.value : '0', count ? count.value : '');
  if (!values.ok) {
    loggerError(index, values.message, values.field);
    return;
  }
  L.weights[index] = values.weight;
  L.counts[index] = values.reps;
  loggerError(index, '', 'count');
  setLoggerBusy(index, true);
  const token = L.token;
  try {
    const result = await api('/lifts', {
      method: 'POST',
      body: { exercise: row.exercise, weight: values.weight, reps: values.reps, quest_id: L.questId },
    });
    if (!isRouteTokenCurrent(token) || token !== L.token) return;
    if (result.today !== L.today) L.today = result.today;
    L.todayCount = result.sets_today;
    L.recent.unshift(rememberLiftRecord(result.set));
    updateLoggerProgress(index);
    paintTodaysLifts();
    const feedback = document.getElementById(`logger-feedback-${index}`);
    if (feedback) feedback.textContent = `${unit === 'seconds' ? 'Hold' : 'Set'} inked in the ledger.`;
    SFX.coin();
  } catch (error) {
    if (!isRouteTokenCurrent(token) || token !== L.token) return;
    const message = document.getElementById(`logger-error-${index}`);
    if (message) message.textContent = 'The ink would not take. Your numbers remain; try again.';
  } finally {
    if (isRouteTokenCurrent(token) && token === L.token) setLoggerBusy(index, false);
  }
};

function removeLiftLocally(id) {
  const record = L.records.get(id);
  L.recent = L.recent.filter(set => set.id !== id);
  W.sets = W.sets.filter(set => set.id !== id);
  L.records.delete(id);
  if (record && record.ts.slice(0, 10) === L.today) L.todayCount = Math.max(0, L.todayCount - 1);
  if (record) {
    L.routine.forEach((row, index) => {
      if (row.exercise === record.exercise) updateLoggerProgress(index);
    });
  }
  paintTodaysLifts();
  paintScrivenerSets();
  window.dispatchEvent(new CustomEvent('ironvale:lift-changed', { detail: { action: 'delete', id } }));
}

G.undoSet = async (id) => {
  if (!L.records.has(id) || L.pendingIds.has(id)) return;
  const token = captureRouteToken();
  L.pendingIds.add(id);
  try {
    await api(`/lifts/${id}`, { method: 'DELETE' });
    if (!isRouteTokenCurrent(token)) return;
    removeLiftLocally(id);
    toast('The newest line is struck. Your other sets stand.');
  } finally {
    L.pendingIds.delete(id);
  }
};

G.editSetByRecord = (set) => {
  rememberLiftRecord(set);
  G.editSet(set.id);
};

G.editSet = (id) => {
  const set = L.records.get(id);
  if (!set) return;
  const unit = G.liftUnit(set);
  const countLabel = unit[0].toUpperCase() + unit.slice(1);
  const editor = { id, token: captureRouteToken(), instance: ++liftEditorSequence, busy: false, overlay: null };
  L.editor = editor;
  editor.overlay = showModal(`<div class="win"><span class="win-title">Amend: ${esc(set.exercise)}</span>
    <div class="logger-fields logger-fields-stacked">
      ${unit === 'seconds' ? '' : `<div class="logger-field-row">
        <label for="es-weight">Weight (${esc(S.state.settings.weight_unit)})</label>
        <button class="btn logger-step" onclick="G.esAdj('weight',-2.5)" aria-label="Decrease weight">&minus;</button>
        <input class="logger-input" id="es-weight" type="number" min="0" step="0.1" inputmode="decimal" value="${set.weight}" oninput="G.esInput()">
        <button class="btn logger-step" onclick="G.esAdj('weight',2.5)" aria-label="Increase weight">+</button>
      </div>`}
      <div class="logger-field-row">
        <label for="es-count">${countLabel}</label>
        <button class="btn logger-step" onclick="G.esAdj('count',-1)" aria-label="Decrease ${unit}">&minus;</button>
        <input class="logger-input" id="es-count" type="number" min="0" step="1" inputmode="numeric" value="${set.reps}" oninput="G.esInput()">
        <button class="btn logger-step" onclick="G.esAdj('count',1)" aria-label="Increase ${unit}">+</button>
      </div>
    </div>
    <div class="logger-error" id="es-error" role="alert"></div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px">
      <button class="btn green" id="es-save" onclick="G.esSave(${id})">SAVE CORRECTION</button>
      <button class="btn danger" id="es-delete" onclick="G.esDelete(${id})">STRIKE IT</button>
      <button class="btn small" id="es-cancel" style="min-width:0" onclick="G.closeOverlay(this.closest('.overlay'))">cancel</button>
    </div>
  </div>`);
};

G.esInput = () => {
  const error = document.getElementById('es-error');
  if (error) error.textContent = '';
  document.querySelectorAll('#es-weight,#es-count').forEach(input => input.setAttribute('aria-invalid', 'false'));
};

G.esAdj = (field, delta) => {
  const input = document.getElementById(`es-${field}`);
  if (!input) return;
  const set = L.editor && L.records.get(L.editor.id);
  if (!set) return;
  const whole = field === 'count';
  const parsed = parseLiftNumber(input.value, whole ? G.liftUnit(set) : 'Weight', whole);
  const fallback = whole ? set.reps : set.weight;
  const next = Math.max(0, (parsed.ok ? parsed.value : fallback) + delta);
  input.value = whole ? Math.round(next) : Math.round(next * 10) / 10;
  G.esInput();
};

function editError(values) {
  const error = document.getElementById('es-error');
  if (error) error.textContent = values.message;
  const input = document.getElementById(`es-${values.field}`);
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus({ preventScroll: true });
  }
}

function isCurrentEditor(editor) {
  return !!editor && L.editor === editor && isRouteTokenCurrent(editor.token);
}

function setEditorBusy(editor, busy) {
  if (!isCurrentEditor(editor)) return;
  editor.busy = busy;
  const save = document.getElementById('es-save');
  const strike = document.getElementById('es-delete');
  const cancel = document.getElementById('es-cancel');
  if (save) { save.disabled = busy; save.textContent = busy ? 'INKING...' : 'SAVE CORRECTION'; }
  if (strike) strike.disabled = busy;
  if (cancel) cancel.disabled = busy;
  if (editor.overlay && editor.overlay.isConnected) {
    editor.overlay.setAttribute('aria-busy', String(busy));
    editor.overlay.dataset.escapeClose = String(!busy);
  }
}

function updateLiftLocally(id, weight, reps) {
  const current = L.records.get(id);
  if (!current) return;
  const updated = { ...current, weight, reps };
  L.records.set(id, updated);
  L.recent = L.recent.map(set => set.id === id ? updated : set);
  W.sets = W.sets.map(set => set.id === id ? updated : set);
  paintTodaysLifts();
  paintScrivenerSets();
  window.dispatchEvent(new CustomEvent('ironvale:lift-changed', { detail: { action: 'update', set: updated } }));
}

G.esSave = async (id) => {
  if (!L.editor || L.editor.id !== id || L.editor.busy) return;
  const editor = L.editor;
  const set = L.records.get(id);
  if (!set) return;
  const unit = G.liftUnit(set);
  const weight = document.getElementById('es-weight');
  const count = document.getElementById('es-count');
  const values = liftValues(unit, weight ? weight.value : '0', count ? count.value : '');
  if (!values.ok) { editError(values); return; }
  setEditorBusy(editor, true);
  try {
    await api(`/lifts/${id}`, { method: 'PATCH', body: { weight: values.weight, reps: values.reps } });
    if (!isCurrentEditor(editor)) return;
    updateLiftLocally(id, values.weight, values.reps);
    setEditorBusy(editor, false);
    G.closeOverlays(() => {
      if (L.editor === editor) L.editor = null;
      toast('Wick corrects the exact line.');
    });
  } catch (error) {
    if (!isCurrentEditor(editor)) return;
    const message = document.getElementById('es-error');
    if (message) message.textContent = 'The correction would not hold. Your numbers remain; try again.';
    setEditorBusy(editor, false);
  }
};

G.esDelete = async (id) => {
  if (!L.editor || L.editor.id !== id || L.editor.busy) return;
  const editor = L.editor;
  setEditorBusy(editor, true);
  try {
    await api(`/lifts/${id}`, { method: 'DELETE' });
    if (!isCurrentEditor(editor)) return;
    removeLiftLocally(id);
    setEditorBusy(editor, false);
    G.closeOverlays(() => {
      if (L.editor === editor) L.editor = null;
      toast('That exact line is struck from the record.');
    });
  } catch (error) {
    if (!isCurrentEditor(editor)) return;
    const message = document.getElementById('es-error');
    if (message) message.textContent = 'The ink resists. Nothing was struck; try again.';
    setEditorBusy(editor, false);
  }
};

/* ================= SCRIVENER (confess & amend) ================= */

function scrivenerSetMarkup(set) {
  rememberLiftRecord(set);
  return `<div class="shop-row" data-lift-id="${set.id}">
    <span class="cdot cat-strength"></span>
    <span class="grow"><span class="s-name">${esc(set.exercise)}</span> <span class="s-desc">${esc(G.formatLift(set))}</span></span>
    <button class="btn small" style="min-width:0" onclick="G.editSet(${set.id})">fix</button>
  </div>`;
}

function paintScrivenerSets() {
  const list = document.getElementById('scrivener-lifts');
  const empty = document.getElementById('scrivener-empty');
  if (list) list.innerHTML = W.sets.map(scrivenerSetMarkup).join('');
  if (empty) empty.hidden = W.activitiesCount > 0 || W.sets.length > 0;
}

SCREENS.scrivener = async function () {
  const token = captureRouteToken();
  const [typesPayload, todayPayload] = await Promise.all([
    api('/claim/types'),
    api('/today'),
  ]);
  if (!isRouteTokenCurrent(token)) return;
  const recent = await api('/day/' + todayPayload.today);
  if (!isRouteTokenCurrent(token)) return;
  const types = typesPayload.types;
  const line = congratLine('wick') || pickLine(GREETINGS.wick);
  W.sets = recent.sets;
  W.activitiesCount = recent.activities.length;
  L.records.clear();
  W.sets.forEach(rememberLiftRecord);

  // phones seat Wick below the ledger work, like the quest givers — his
  // typewriter dialog reflows its window and would shove the form around
  const wickWin = `
    <div class="win">
      <div class="npc-head">
        ${portraitTag('wick', 128)}
        <div class="dialog"><div class="npc-name">Wick the Scrivener</div><div id="dlg"></div></div>
      </div>
    </div>`;
  $app().innerHTML = shell(`
    ${isCompactPhone() ? '' : wickWin}
    <div class="win deed-form"><span class="win-title">Confess a Deed (unverified)</span>
      <div class="muted" style="font-size:17px;margin-bottom:8px">Forgot your tracker at the crag? Swear it before Wick.
        No witness means prorated pay: seven coins in ten.</div>
      <div class="formrow">
        ${pixelSelect('cl-kind', types.map(t => ({ value: t.kind, label: t.label })),
          '', 'what was done', undefined, 'What was done')}</div>
      <div class="formrow">
        <input type="number" id="cl-min" placeholder="duration (minutes)" aria-label="duration in minutes"
          min="1" max="600" step="1" inputmode="numeric"
          oninput="this.value=this.value.replace(/[^0-9]/g,'')"></div>
      <div class="formrow"><input type="text" id="cl-note" placeholder="note (optional)" aria-label="note (optional)"></div>
      <button class="btn big green btn-fit" onclick="G.claim()">SWEAR IT ON THE LEDGER</button>
    </div>
    <div class="win"><span class="win-title">Today's Record (tap to fix)</span>
      ${recent.activities.map(a => `<div class="shop-row">
        <span class="cdot cat-${a.category}"></span>
        <span class="grow"><span class="s-name">${esc(a.name || a.type)}</span><br><span class="s-desc">${a.minutes} min &middot; ${esc(a.source)}</span></span>
        <button class="btn small danger" style="min-width:0" onclick="G.strikeActivity('${a.id}')">strike</button>
      </div>`).join('') || ''}
      <div id="scrivener-lifts">${W.sets.map(scrivenerSetMarkup).join('')}</div>
      <div class="muted" id="scrivener-empty" ${recent.activities.length || W.sets.length ? 'hidden' : ''}>Nothing recorded today.</div>
      <div class="muted" style="font-size:16px;margin-top:6px">older entries: Hall of Records &rarr; Calendar &rarr; tap a day</div>
    </div>
    ${isCompactPhone() ? wickWin : ''}
  `);
  typewrite(document.getElementById('dlg'), line, 14, npcPortraitEl());
};

G.claim = async () => {
  const token = captureRouteToken();
  const kind = document.getElementById('cl-kind').value;
  if (!kind) { toast('Tell Wick what was done, first.', true); return; }
  // parse BEFORE clamping — clamping an empty field to 1 minute would
  // quietly swear a sixty-second deed instead of asking
  const raw = parseInt(document.getElementById('cl-min').value, 10) || 0;
  if (!raw) { toast('How long, exactly? Give Wick a number of minutes.', true); return; }
  const minutes = Math.max(1, Math.min(600, raw));
  const note = document.getElementById('cl-note').value;
  const r = await api('/claim', { method: 'POST', body: { kind, minutes, note } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  render();
  showCeremony(r.rewards, 'A Deed Sworn');
};
