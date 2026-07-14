/* The Hall of Records: stats tabs, calendar + day detail, the Tapestry,
   the Long Road map, the Mantel, compendium, and the Almanac. */
const CAT_LABELS = {
  run: 'run', ride: 'ride', climb: 'climb', strength: 'lift',
  mobility: 'mobility', walk: 'walk/hike', swim: 'swim', other: 'other',
};

/* ================= HALL OF RECORDS ================= */

let statsTab = 'body';
let calState = null;
let vitalsRange = 90; // days shown in the Vitals charts; 0 = all time
let almMonth = null;  // Almanac edition being read; null = latest published
let hallDaySets = new Map();
let hallDayActivities = new Map();
// tab pairs render as spaced clusters (related views stay adjacent)
const HALL_GROUPS = [
  { tabs: [['body', 'Body'], ['vitals', 'Vitals']] },
  { tabs: [['deeds', 'The Road'], ['iron', 'The Iron']] },
  { tabs: [['calendar', 'Calendar'], ['chronicle', 'Chronicle']] },
  { tabs: [['compendium', 'Compendium'], ['almanac', 'Almanac']] },
];
RESETS.push(() => {
  statsTab = 'body';
  calState = null;
  vitalsRange = 90;
  almMonth = null;
  hallDaySets = new Map();
  hallDayActivities = new Map();
  COMP.open = {};
});

SCREENS.stats = async function () {
  const d = await api('/stats?wellness_days=' + vitalsRange);
  const chron = statsTab === 'chronicle' ? (await api('/chronicle')).events : [];
  const c = d.character;
  const wu = S.state.settings.weight_unit;

  const tabBtn = (id, label, glow = false) =>
    `<button class="btn small ${statsTab === id ? 'active' : ''} ${glow ? 'tab-glow' : ''}" style="min-width:0" onclick="statsTab='${id}';render()">${label}${glow ? '<span class="tab-glow-dot"></span>' : ''}</button>`;
  const hallNav = `<div class="hall-nav">${HALL_GROUPS.map(group => `
    <div class="hall-nav-group">
      <div class="hall-nav-buttons">${group.tabs.map(([id, label]) => tabBtn(id, label, id === 'almanac' && !!S.state.almanac_unread)).join('')}</div>
    </div>`).join('')}</div>`;
  // Maud has something to say about every room of her Hall
  const CURATOR_LINES = {
    body: 'The shape of you, in numbers. The numbers speak well of you today. Hoo.',
    vitals: 'Heartbeats, breath, and sleep — the body keeps its own chronicle. I merely file it.',
    deeds: 'Every kilometer, reported by the crows. They exaggerate nothing; I checked.',
    iron: 'The heavy ledger. Mind your fingers — some of these numbers bite.',
    calendar: 'A year of days, pressed flat between two covers. Tap one; they like being remembered.',
    compendium: 'The Compendium of Honest Labor. Do read the how before you swing the what.',
    almanac: 'My monthly editions. I bind one each time a moon closes. Mind the ink.',
    chronicle: 'Everything that ever happened, in the order it happened. My finest filing.',
  };

  let body = '';
  if (statsTab === 'body') {
    const sb = (label, val, color) => `<div class="statbar">
      <span class="sb-label">${label}</span>
      <span class="sb-track"><span class="sb-fill" style="display:block;width:${Math.min(100, val * 2)}%;background:${color}"></span></span>
      <span class="sb-val">${val}</span></div>`;
    // plain fetch, not api(): a stale live backend must show no shelf, not error
    let ks = null;
    try { const rr = await fetch('/api/keepsakes'); if (rr.ok) ks = (await rr.json()).keepsakes; } catch (e) { /* backend predates the mantel */ }
    S.keepsakes = ks;
    const mantelWin = ks ? `<div class="win"><span class="win-title">The Mantel</span>
      <div class="muted" style="font-size:16px;margin-bottom:6px">what the years leave on the shelf${ks.length ? ' — tap a keepsake' : ''}</div>
      ${ks.length ? `<div class="mantel">${ks.map((k, i) =>
        `<div class="ks" onclick="G.keepsake(${i})">${spriteTag(k.sprite, 48)}</div>`).join('')}</div>`
    : '<div class="mantel mantel-empty"><span class="muted">bare wood, for now. it is patient.</span></div>'}
    </div>` : '';
    const notesWin = d.insights.length ? `<div class="win"><span class="win-title">The Curator's Notes</span>
      ${d.insights.map(([lv, txt]) => `<div class="insight ${lv}" style="font-size:18px;margin:5px 0">${esc(txt)}</div>`).join('')}
    </div>` : '';
    body = notesWin + `<div class="win"><span class="win-title">${esc(c.name)}, Level ${c.level}</span>
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
    </div>` + mantelWin;
  } else if (statsTab === 'vitals') {
    const w = d.wellness;
    const wtConv = (kg) => wu === 'lb' ? kgToLb(kg) : kg;
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
    const rangeBtn = (val, label) =>
      `<button class="btn small ${vitalsRange === val ? 'active' : ''}" style="min-width:0" onclick="vitalsRange=${val};render()">${label}</button>`;
    const rangeLabel = vitalsRange ? `last ${vitalsRange} days` : 'all time';

    body = `<div class="win"><span class="win-title">Vitals (from intervals.icu)</span>
      <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        ${rangeBtn(30, '30d')}${rangeBtn(90, '90d')}${rangeBtn(180, '180d')}${rangeBtn(365, '1y')}${rangeBtn(0, 'All')}
      </div>
      <div class="muted" style="font-size:14px;margin-bottom:8px">showing ${rangeLabel} &middot; ${w.length} day(s) with readings</div>
      ${w.length === 0 ? '<div class="muted">No wellness data yet. Link intervals.icu in Settings and send the ravens.</div>' : ''}
      ${chart('ch-hrv', 'HRV', 'hrv', 'var(--green)', v => v.toFixed(0) + ' ms')}
      ${chart('ch-rhr', 'Resting heart rate', 'resting_hr', 'var(--red)', v => v.toFixed(0) + ' bpm')}
      ${chart('ch-vo2', 'VO2max', 'vo2max', 'var(--blue)', v => v.toFixed(1))}
      ${chart('ch-ctl', 'Fitness (CTL)', 'ctl', 'var(--gold-bright)', v => v.toFixed(0))}
      ${chart('ch-wt', 'Bodyweight', 'weight', 'var(--purple)', v => wtConv(v).toFixed(1) + wu)}
    </div>
    ${sleepVals.length ? `<div class="win"><span class="win-title">The Hall of Rest</span>
      ${sleepPanel}
      <div class="muted" style="font-size:15px;margin-bottom:2px">hours slept per night — heroes are made in bed</div>
      <canvas class="chart" id="ch-sleep" width="440" height="90"></canvas>
    </div>` : ''}`;
  } else if (statsTab === 'deeds') {
    const rs = d.run_summary;
    // plain fetch, no api(): a stale backend (frontend updates from disk
    // instantly, .py only on restart) must degrade to "no map", not an error
    let road = null;
    try { const rr = await fetch('/api/road'); if (rr.ok) road = await rr.json(); } catch (e) { /* backend predates the road */ }
    S.roadState = road;   // kept for click hit-testing + claims
    body = `${road ? `<div class="win"><span class="win-title">The Long Road</span>
      <div class="muted" style="font-size:16px;margin-bottom:6px">every kilometer you have ever covered, walked by a small and stubborn pilgrim</div>
      <div class="road-scroll" id="road-scroll"><canvas id="road-map" height="214"></canvas></div>
      <div class="road-caption">
        <b style="color:var(--gold-bright)">${road.total_km} km</b> from the Vale Gate
        ${road.km_to_next != null ? ` &middot; ${road.km_to_next} km to the next landmark` : ''}
        <br><span class="muted" style="font-size:14px">${road.breakdown.run} run &middot; ${road.breakdown.walk} walked &middot; ${road.breakdown.swim} swum &middot; ${road.breakdown.ride} ridden (counts &frac14;) &middot; tap a landmark for its story</span>
      </div>
      ${road.unclaimed > 0 ? `<div class="center" style="margin-top:8px">
        <button class="btn wide green" onclick="G.roadClaim()">PRESS ON — ${road.unclaimed} landmark${road.unclaimed > 1 ? 's' : ''} reached</button>
      </div>` : ''}
    </div>` : ''}
    <div class="win"><span class="win-title">The Road (12 weeks)</span>
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
    // plain fetch, not api(): a stale live backend (static JS updates from
    // disk instantly, .py needs a restart) must skip the weave, not error
    let tap = null;
    try { const rr = await fetch('/api/tapestry'); if (rr.ok) tap = await rr.json(); } catch (e) { /* backend predates the weave */ }
    S.tapestry = tap;
    const tapWin = tap ? `<div class="win"><span class="win-title">The Tapestry</span>
      <div class="muted" style="font-size:16px;margin-bottom:6px">a year of days, one stitch each, colored by the day's longest labor</div>
      <div class="tapestry-scroll" id="tapestry-scroll"><canvas id="tapestry-cv"></canvas></div>
      <div class="tap-legend">${Object.entries(CAT_LABELS).map(([k, v]) =>
        `<span><span class="cdot cat-${k}"></span>${v}</span>`).join('')}</div>
      <div class="road-caption" style="font-size:16px">
        <b style="color:var(--gold-bright)">${tap.woven}</b> day${tap.woven === 1 ? '' : 's'} woven this past year
        &middot; longest unbroken thread: <b style="color:var(--gold-bright)">${tap.best_stretch}</b> day${tap.best_stretch === 1 ? '' : 's'}
        <br><span class="muted" style="font-size:14px">tap a stitch to inspect that day</span>
      </div>
    </div>` : '';
    body = tapWin + await calendarBody();
  } else if (statsTab === 'compendium') {
    body = compendiumBody();
  } else if (statsTab === 'almanac') {
    // plain fetch, not api(): a stale live backend (static JS updates from
    // disk instantly, .py needs a restart) must show a bare shelf, not error
    let alm = null;
    try {
      const rr = await fetch('/api/almanac' + (almMonth ? '?month=' + almMonth : ''));
      if (rr.ok) alm = await rr.json();
    } catch (e) { /* backend predates the almanac */ }
    if (alm && alm.month && alm.month === alm.latest && S.state.almanac_unread) {
      S.state.almanac_unread = false; // douse the Hall's badge without a refetch
      fetch('/api/almanac/seen', { method: 'POST' }).catch(() => {});
    }
    if (!alm || !alm.months.length) {
      body = `<div class="win"><span class="win-title">The Vale Almanac</span>
        <div class="muted center" style="padding:14px 8px">The shelf is bare — Maud binds an edition only once a month closes with deeds in it.</div>
      </div>`;
    } else {
      const f = alm.figures;
      const idx = alm.months.indexOf(alm.month);
      const navBtn = (m, label) => m
        ? `<button class="btn small" style="min-width:0" onclick="almMonth='${m}';render()">${label}</button>`
        : `<span style="width:70px"></span>`;
      const ton = wu === 'lb' ? Math.round(kgToLb(f.tonnage)) : f.tonnage;
      const row = (label, val, show) => show ? `<tr><td>${label}</td><td>${val}</td></tr>` : '';
      body = `<div class="win almanac-page">
        <div class="alm-head">The Vale Almanac<span>${alm.label} edition &middot; as bound by the Curator</span></div>
        ${alm.narration.map(p => `<div class="alm-p">${esc(p)}</div>`).join('')}
        <table class="rpg" style="margin-top:12px">
          ${row('Days with deeds', `${f.days_active} of ${f.days_in_month}`, true)}
          ${row('Longest thread', `${f.best_thread} day${f.best_thread === 1 ? '' : 's'}`, f.best_thread > 0)}
          ${row('Hours of labor', (f.total_min / 60).toFixed(1), f.total_min > 0)}
          ${row('On foot', f.km_foot + ' km', f.km_foot > 0)}
          ${row('By wheel', f.km_wheel + ' km', f.km_wheel > 0)}
          ${row('The iron', `${f.sets} sets &middot; ${ton.toLocaleString()} ${wu} moved`, f.sets > 0)}
          ${row('Quests fulfilled', f.quests + (f.honors ? ` (${f.honors} with honor)` : ''), f.quests > 0)}
          ${row('Chief disciplines', f.top_cats.map(([ct, mn]) => `${CAT_LABELS[ct] || ct} ${mn}m`).join(' &middot; '), f.top_cats.length > 0)}
        </table>
        <div class="alm-sign">&mdash; Maud, Curator of the Hall</div>
        <div class="alm-nav">
          ${navBtn(alm.months[idx - 1], '&laquo; older')}
          <span class="muted" style="font-size:15px">edition ${idx + 1} of ${alm.months.length}</span>
          ${navBtn(alm.months[idx + 1], 'newer &raquo;')}
        </div>
      </div>`;
    }
  } else {
    body = `<div class="win"><span class="win-title">The Chronicle</span>
      <div class="chron">${chron.map(e => `<div class="ev"><span class="ts">${e.ts.slice(5, 16).replace('T', ' ')}</span> ${esc(e.text)}</div>`).join('') || '<span class="muted">history not yet written</span>'}</div>
    </div>`;
  }

  $app().innerHTML = shell(`
    <div class="win tight">
      <div class="npc-head">
        ${portraitTag('maud', 128)}
        <div class="dialog">
          <div class="npc-name">Maud, Curator of the Hall <span class="muted" style="font-size:15px">(an owl, somehow)</span></div>
          <div id="curator-dlg" style="min-height:24px;font-size:19px"></div>
        </div>
      </div>
    </div>
    ${hallNav}
    ${body}
  `);
  typewrite(document.getElementById('curator-dlg'),
    CURATOR_LINES[statsTab] || CURATOR_LINES.body, 14, npcPortraitEl());
  if (statsTab === 'deeds') {
    drawBars('ch-run', d.weeks.map(w => w.run_min), '#7ab55c');
    drawRoadMap(S.roadState);
  }
  if (statsTab === 'calendar') drawTapestry(S.tapestry);
  if (statsTab === 'iron') drawBars('ch-ton', d.weeks.map(w => w.tonnage), '#c85050');
  if (statsTab === 'vitals') {
    const w = d.wellness;
    const pts = (f) => w.filter(r => r[f] != null).map(r => r[f]);
    drawLine('ch-hrv', pts('hrv'), '#7ab55c');
    drawLine('ch-rhr', pts('resting_hr'), '#c85050');
    drawLine('ch-vo2', pts('vo2max'), '#6aa0c8');
    drawLine('ch-ctl', pts('ctl'), '#f0d080');
    drawLine('ch-wt', pts('weight').map(v => wu === 'lb' ? kgToLb(v) : v), '#a06ac8');
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
      ${byEquip[eq].map(e => `<div class="shop-row" style="cursor:pointer" onclick="G.compToggle(${S.exercises.indexOf(e)})">
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

G.compToggle = (index) => {
  const exercise = S.exercises[index];
  if (!exercise) return;
  COMP.open[exercise.name] = !COMP.open[exercise.name];
  render();
};

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
  calState.m += dir;
  if (calState.m < 1) { calState.m = 12; calState.y--; }
  if (calState.m > 12) { calState.m = 1; calState.y++; }
  render();
};

G.dayDetail = async (dstr) => {
  const d = await api(`/day/${dstr}`);
  const wu = S.state.settings.weight_unit;
  hallDaySets = new Map(d.sets.map(s => [s.id, s]));
  hallDayActivities = new Map(d.activities.map((activity, index) => [index, activity.id]));
  const acts = d.activities.map((a, index) => `<div class="shop-row">
    <span class="cdot cat-${a.category}"></span>
    <span class="grow"><span class="s-name">${esc(a.name || a.type)}</span><br>
      <span class="s-desc">${a.minutes ? a.minutes + ' min' : ''} ${a.distance ? '&middot; ' + (a.distance / 1000).toFixed(1) + 'km' : ''} &middot; ${esc(a.source)}</span></span>
    <button class="btn small danger" style="min-width:0" onclick="G.strikeHallActivity(${index})">strike</button>
  </div>`).join('');
  const sets = d.sets.map(s => `<div class="shop-row">
    <span class="cdot cat-strength"></span>
    <span class="grow"><span class="s-name">${esc(s.exercise)}</span> <span class="s-desc">${s.weight}${wu} &times; ${s.reps}</span></span>
    <button class="btn small" style="min-width:0" onclick="G.editHallSet(${s.id})">fix</button>
  </div>`).join('');
  const quests = d.quests.map(q => `<div class="shop-row"><span style="color:var(--gold-bright)">&#9733;</span>
    <span class="grow"><span class="s-name">${esc(q.title)}</span></span></div>`).join('');
  showModal(`<div class="win"><span class="win-title">${dstr}</span>
    ${acts || ''}${sets || ''}${quests || ''}
    ${d.sets.length ? `<div class="center" style="margin-top:8px"><button class="btn danger small" style="min-width:0" onclick="G.strikeDay('${dstr}',${d.sets.length})">STRIKE WHOLE LIFTING SESSION (${d.sets.length} sets)</button></div>` : ''}
    ${!acts && !sets && !quests ? '<p class="muted">A day of rest. The ledger holds nothing against you.</p>' : ''}
    <div class="center" style="margin-top:10px"><button class="btn small" style="min-width:0" onclick="this.closest('.overlay').remove()">close</button></div>
  </div>`);
};

G.editHallSet = (id) => {
  const set = hallDaySets.get(id);
  if (!set) return;
  G.editSet(set.id, set.exercise, set.weight, set.reps);
};

G.strikeHallActivity = (index) => {
  if (!hallDayActivities.has(index)) return;
  G.strikeActivity(hallDayActivities.get(index));
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

/* ---- The Tapestry: a year of days as a woven grid, GitHub-graph style but
   in the Vale's cloth. Columns are Monday-first weeks (the backend aligns
   the start date to a Monday, so index % 7 IS the weekday); each stitch is
   colored by that day's dominant activity category, using the same palette
   as the calendar's .cat-* dots so the two read as one system. ---- */

const TAP_COLORS = {
  run: '#7ab55c', ride: '#6aa0c8', climb: '#e07030', strength: '#c85050',
  mobility: '#a06ac8', walk: '#5cb5a5', swim: '#4a90d0', other: '#9a9aa8',
};
const TAP_CELL = 12, TAP_GAP = 2, TAP_TOP = 18, TAP_LEFT = 26;
const TAP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function drawTapestry(tap) {
  const cv = document.getElementById('tapestry-cv');
  if (!cv || !tap) return;
  const days = tap.days;
  const weeks = Math.ceil(days.length / 7);
  const step = TAP_CELL + TAP_GAP;
  cv.width = TAP_LEFT + weeks * step + 6;
  cv.height = TAP_TOP + 7 * step + 6;
  cv.style.width = cv.width + 'px';
  cv.style.height = cv.height + 'px';
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0c0c14';
  ctx.fillRect(0, 0, cv.width, cv.height);

  ctx.font = '11px monospace';
  // weekday hints down the left
  ctx.fillStyle = '#55506a';
  [['M', 0], ['W', 2], ['F', 4]].forEach(([ch, row]) =>
    ctx.fillText(ch, 8, TAP_TOP + row * step + TAP_CELL - 2));

  days.forEach((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    const x = TAP_LEFT + col * step, y = TAP_TOP + row * step;
    // month label above the column containing each month's 1st
    if (d.date.slice(8) === '01') {
      ctx.fillStyle = '#776f8e';
      ctx.fillText(TAP_MONTHS[parseInt(d.date.slice(5, 7), 10) - 1], x, TAP_TOP - 6);
    }
    ctx.fillStyle = d.cat ? TAP_COLORS[d.cat] : '#191928';
    ctx.fillRect(x, y, TAP_CELL, TAP_CELL);
    if (i === days.length - 1) {   // today gets a gold border stitch
      ctx.strokeStyle = '#f0d080';
      ctx.strokeRect(x + 0.5, y + 0.5, TAP_CELL - 1, TAP_CELL - 1);
    }
  });

  // newest stitches in view first
  const wrap = document.getElementById('tapestry-scroll');
  if (wrap) wrap.scrollLeft = cv.width;

  cv.onclick = (e) => {
    const rect = cv.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const col = Math.floor((cx - TAP_LEFT) / step), row = Math.floor((cy - TAP_TOP) / step);
    if (col < 0 || row < 0 || row > 6) return;
    const idx = col * 7 + row;
    if (idx >= 0 && idx < days.length) G.dayDetail(days[idx].date);
  };
}

/* ---- The Long Road map: a side-scrolling pixel pilgrimage. Landmarks sit at
   FIXED 140px intervals regardless of their real km gaps (10 km between the
   first pair, 250 km between cairns past the map's edge) — the pilgrim
   interpolates between the two landmarks bracketing the real total, which
   keeps the map dense and readable instead of mostly empty road. ---- */

const ROAD_SPACING = 140, ROAD_MARGIN = 70, ROAD_BASE = 150;

function roadLandmarkX(i) { return ROAD_MARGIN + i * ROAD_SPACING; }

function drawRoadMap(road) {
  const cv = document.getElementById('road-map');
  if (!cv || !road) return;
  const marks = road.landmarks;
  const W = ROAD_MARGIN * 2 + (marks.length - 1) * ROAD_SPACING;
  const H = 214;   // ROAD_BASE(150) + km-label baseline(40) + wobble(4) + a little breathing room
  cv.width = W;
  cv.height = H;   // keep the canvas's real pixel size in lockstep with H, not just the HTML attribute
  cv.style.width = W + 'px';
  const ctx = cv.getContext('2d');

  // sky: each segment tints a little further from home
  for (let i = 0; i < marks.length; i++) {
    const x0 = i === 0 ? 0 : roadLandmarkX(i) - ROAD_SPACING / 2;
    const x1 = i === marks.length - 1 ? W : roadLandmarkX(i) + ROAD_SPACING / 2;
    const hue = (215 + i * 11) % 360;
    ctx.fillStyle = `hsl(${hue}, 22%, 9%)`;
    ctx.fillRect(x0, 0, x1 - x0, H);
    ctx.fillStyle = `hsl(${hue}, 26%, 13%)`;
    ctx.fillRect(x0, H - 70, x1 - x0, 70);
  }
  // stars, seeded so they don't shimmer between renders
  const rnd = mulberry32(0x50AD);
  ctx.fillStyle = 'rgba(232,232,240,0.5)';
  for (let i = 0; i < W / 14; i++) ctx.fillRect(rnd() * W, rnd() * 90, 2, 2);

  // the road itself: a gently wavering line with a dashed centre
  ctx.fillStyle = '#3a3040';
  for (let x = 0; x < W; x += 4) {
    const wob = Math.sin(x / 90) * 4;
    ctx.fillRect(x, ROAD_BASE + wob, 4, 12);
  }
  ctx.fillStyle = '#5a4d30';
  for (let x = 0; x < W; x += 18) {
    const wob = Math.sin(x / 90) * 4;
    ctx.fillRect(x, ROAD_BASE + 5 + wob, 8, 2);
  }

  // landmarks: reached ones lit + named, the future in silhouette
  marks.forEach((m, i) => {
    const x = roadLandmarkX(i);
    const wob = Math.sin(x / 90) * 4;
    ctx.globalAlpha = m.reached ? 1 : 0.3;
    const spr = SPRITES[m.icon];
    if (spr) {
      const s = 3;
      spr.r.forEach((row, ry) => [...row].forEach((ch, rx) => {
        const col = spr.p[ch];
        if (!col) return;
        ctx.fillStyle = col;
        ctx.fillRect(x - 18 + rx * s, ROAD_BASE - 40 + ry * s + wob, s, s);
      }));
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = m.reached ? (m.claimed ? '#c9a24b' : '#f0d080') : '#55506a';
    ctx.fillText(m.reached ? m.name : '???', x, ROAD_BASE + 28 + wob);
    ctx.fillStyle = '#776f8e';
    ctx.font = '11px monospace';
    ctx.fillText(m.km + ' km', x, ROAD_BASE + 40 + wob);
    if (m.reached && !m.claimed) {
      ctx.fillStyle = '#7ab55c';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('!', x + 20, ROAD_BASE - 38 + wob);
    }
    ctx.textAlign = 'left';
  });

  // the pilgrim: your own hero, mid-stride between the bracketing landmarks
  let px = roadLandmarkX(0);
  const km = road.total_km;
  for (let i = 0; i < marks.length - 1; i++) {
    if (km >= marks[i].km && km < marks[i + 1].km) {
      const frac = (km - marks[i].km) / (marks[i + 1].km - marks[i].km);
      px = roadLandmarkX(i) + frac * ROAD_SPACING;
      break;
    }
    if (km >= marks[marks.length - 1].km) px = roadLandmarkX(marks.length - 1);
  }
  const pwob = Math.sin(px / 90) * 4;
  drawHero(cv.getContext('2d'), (S.state.character.appearance || {}), 2, px - 12, ROAD_BASE - 26 + pwob);
  ctx.fillStyle = '#f0d080';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('YOU', px, ROAD_BASE - 32 + pwob);
  ctx.textAlign = 'left';

  // scroll the viewport to the pilgrim
  const wrap = document.getElementById('road-scroll');
  if (wrap) wrap.scrollLeft = Math.max(0, px - wrap.clientWidth / 2);

  // tap a reached landmark for its lore card
  cv.onclick = (e) => {
    const rect = cv.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (cv.width / rect.width);
    let best = null, bestD = 55;
    marks.forEach((m, i) => {
      const d = Math.abs(cx - roadLandmarkX(i));
      if (d < bestD && m.reached) { best = m; bestD = d; }
    });
    if (best) G.roadLore(best.key);
  };
}

G.roadLore = (key) => {
  const m = (S.roadState?.landmarks || []).find(x => x.key === key);
  if (!m || !m.reached) return;
  showModal(`<div class="win center road-card" style="max-width:400px">
    <span class="win-title">${esc(m.name)}</span>
    <div style="display:flex;justify-content:center;margin:10px 0">${spriteTag(m.icon, 72)}</div>
    <div class="muted" style="font-size:14px;letter-spacing:2px">KILOMETER ${m.km}</div>
    <p class="road-lore">${esc(m.lore)}</p>
    <button class="btn small" style="min-width:0" onclick="this.closest('.overlay').remove()">walk on</button>
  </div>`);
};

G.keepsake = (i) => {
  const k = (S.keepsakes || [])[i];
  if (!k) return;
  showModal(`<div class="win center road-card" style="max-width:400px">
    <span class="win-title">${esc(k.name)}</span>
    <div style="display:flex;justify-content:center;margin:10px 0">${spriteTag(k.sprite, 72)}</div>
    <div class="muted" style="font-size:14px;letter-spacing:2px">${k.date ? 'KEPT SINCE ' + k.date : 'FROM A DAY THE LEDGER DOES NOT NAME'}</div>
    <p class="road-lore">${esc(k.lore)}</p>
    <button class="btn small" style="min-width:0" onclick="this.closest('.overlay').remove()">back on the shelf</button>
  </div>`);
};

G.roadClaim = async () => {
  let r;
  try {
    r = await api('/road/claim', { method: 'POST' });
  } catch (e) { return; }
  await refreshState();
  SFX.fanfare();
  const more = (S.roadState?.unclaimed || 1) - 1;
  showModal(`<div class="win ceremony road-card">
    <h2>YOU REACH ${esc(r.landmark).toUpperCase()}</h2>
    <div class="muted" style="font-size:14px;letter-spacing:2px;margin:4px 0">KILOMETER ${r.km} OF THE LONG ROAD</div>
    <p class="road-lore">${esc(r.lore)}</p>
    <div class="reward-line" style="color:var(--gold-bright)">&#9670; +${r.reward.gold} gold</div>
    <div class="reward-line" style="color:var(--blue)">&#9678; +${r.reward.tokens} brass token</div>
    ${r.reward.pack ? '<div class="reward-line">+ a Monster Pack, left by an earlier traveler</div>' : ''}
    <div style="margin-top:14px">
      <button class="btn big" onclick="this.closest('.overlay').remove();render()">${more > 0 ? 'PRESS ON' : 'WALK ON'}</button>
    </div>
  </div>`, { backdropClose: false });
};
