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
  const key = S.params.giver;
  const g = S.state.givers[key];
  const data = await api(`/offers/${key}`);
  let line;
  if (S.params.react) line = pickLine(REACTIONS[S.params.react][key]);
  else line = congratLine(key) || (S.state.npc_notices || {})[key] || pickLine(GREETINGS[key]);
  const isLiftGiver = ['kettlebell', 'strength'].includes(key);

  const rewardsLine = (o) => `<div class="o-rewards">reward: <b>+${o.xp} XP</b> &middot; <span class="g">&#9670;${o.gold}+</span> &middot; +${o.vigor} vigor${o.bonus_vigor ? ' (+1 bonus)' : ''}</div>`;

  // the omens Elowen read — shown on a rest-writ offer and on the sworn writ
  const omensBlock = (d) => (d.reasons && d.reasons.length) ? `
    <div class="omens">
      <div class="omens-title">THE OMENS</div>
      ${d.reasons.map(r => `<div class="omen-line">&#9656; ${esc(r)}</div>`).join('')}
    </div>` : '';

  const offerCard = (o) => {
    const routine = o.routine ? `<div class="o-struct">${o.routine.map(r =>
      `&#9656; ${esc(r.exercise)} — ${r.sets}&times;${r.reps}${r.unit === 'seconds' ? 's' : r.unit === 'steps' ? ' steps' : ''}${r.suggest_weight ? ` @ ${r.suggest_weight}` : ''}`
    ).join('<br>')}</div>` : '';
    const isWrit = o.kind === 'rest';
    return `<div class="offer ${isWrit ? 'writ' : ''}">
      <div><span class="o-title">${esc(o.title)}</span>
        ${o.program ? '<span class="chip program">DOCTRINE</span>' : ''}
        ${isWrit ? '<span class="chip rest">REST WRIT</span>' : `<span class="chip ${o.intensity}">${o.intensity}</span>`}
        ${o.target_minutes ? `<span class="o-kind">~${o.target_minutes} min</span>` : ''}</div>
      <div class="muted" style="font-size:18px">&ldquo;${esc(o.blurb)}&rdquo;</div>
      ${isWrit ? omensBlock(o) : ''}
      <div class="o-struct">${esc(o.structure)}</div>
      ${routine}
      ${o.focus ? `<div style="margin:4px 0">${bodyMapTag(o.focus, 78)}</div>` : ''}
      ${rewardsLine(o)}
      ${isWrit ? '<div class="o-rewards" style="color:var(--green)">and the streak keeps itself tonight — rest counts</div>' : ''}
      <button class="btn green" onclick="G.accept('${key}',${o.offer_id})">${isWrit ? 'SWEAR THE WRIT' : 'ACCEPT QUEST'}</button>
    </div>`;
  };

  let body;
  if (data.active) {
    const q = data.active;
    const isWrit = q.kind === 'rest';
    body = `<div class="win"><span class="win-title">${isWrit ? 'Your Sworn Writ' : 'Your Sworn Quest'}</span>
      <div class="offer ${isWrit ? 'writ' : ''}">
        <div><span class="o-title">${esc(q.title)}</span>
          ${isWrit ? '<span class="chip rest">REST WRIT</span>' : `<span class="chip ${q.details.intensity}">${q.details.intensity}</span>`}</div>
        ${isWrit ? omensBlock(q.details) : ''}
        <div class="o-struct">${esc(q.details.structure)}</div>
        ${q.details.routine ? `<div class="o-struct">${q.details.routine.map(r =>
          `&#9656; ${esc(r.exercise)} — ${r.sets}&times;${r.reps}${r.suggest_weight ? ` @ ${r.suggest_weight}` : ''}`).join('<br>')}</div>` : ''}
        ${rewardsLine(q.details)}
        <div class="${q.completable ? '' : 'muted'}" style="margin:6px 0">${q.completable ? '&#10004; ' : ''}${esc(q.progress_note)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isLiftGiver ? `<button class="btn" onclick="nav('logger',{quest:${q.id}})">OPEN TRAINING LOG</button>` : ''}
          ${q.giver === 'running' ? `<button class="btn" onclick="G.syncThenBack('${key}')">SYNC RUNS</button>` : ''}
          ${isWrit ? ''
            : q.completable
              ? `<button class="btn green" onclick="G.complete(${q.id}, false)">TURN IN QUEST</button>`
              : `<button class="btn" onclick="G.completeHonor(${q.id})">COMPLETE ON HONOR</button>`}
          <button class="btn danger small" style="min-width:0" onclick="G.abandon(${q.id}, '${key}')">${isWrit ? 'set the writ aside' : 'abandon'}</button>
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
        ${portraitTag(g.sprite, 128)}
        <div class="dialog"><div class="npc-name">${esc(g.name)} ${esc(g.title)}</div><div id="dlg"></div></div>
      </div>
    </div>
    ${body}
  `);
  typewrite(document.getElementById('dlg'), line, 14, npcPortraitEl());
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
RESETS.push(() => { RB.exercises = []; });

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
      <button class="btn wide green" style="margin-top:8px" onclick="G.rbSave('${giver}')">FORGE ROUTINE</button>
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
RESETS.push(() => { L.weights = {}; L.reps = {}; L.showHow = {}; });

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
        <button class="btn wide green" onclick="nav('giver',{giver:'${quest.giver}'})">DONE — SEE ${esc(S.state.givers[quest.giver].name).toUpperCase()}</button>
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
  showModal(`<div class="win"><span class="win-title">Amend: ${esc(exercise)}</span>
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
  </div>`);
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
        ${portraitTag('wick', 128)}
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
  typewrite(document.getElementById('dlg'), line, 14, npcPortraitEl());
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
