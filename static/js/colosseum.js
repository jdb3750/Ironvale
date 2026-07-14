/* The Colosseum: three quick games of chance starring your buddy monster.
   The server resolves the whole contest in one call; this file just
   dramatizes whatever already happened, over a couple of seconds. */

const COL = { kind: 'fight', field: null, picked: 0, wager: 20, animating: false };
const COL_LABELS = { fight: 'the duel', race: 'the race', pageant: 'the pageant' };

SCREENS.colosseum = async function () {
  const kind = COL.kind || 'fight';
  const d = await api(`/colosseum/${kind}`);
  COL.field = d;

  if (d.needs_buddy) {
    $app().innerHTML = shell(`
      <div class="win center">
        <span class="win-title">The Colosseum</span>
        <p class="muted" style="margin-top:8px">The crowd murmurs, but there is no champion to cheer for.</p>
        <p>Name a buddy in the Menagerie first — the Colosseum needs someone to bet on.</p>
        <button class="btn" onclick="nav('ranch')">TO THE MENAGERIE</button>
      </div>
    `);
    return;
  }

  if (COL.wager == null || COL.wager > d.gold || COL.picked >= d.contestants.length) {
    COL.wager = Math.max(d.min_bet, Math.min(20, d.gold, d.max_bet));
    COL.picked = 0;
  }

  const tabBtn = (k, label) =>
    `<button class="btn small ${kind === k ? 'active' : ''}" style="min-width:0" onclick="COL.kind='${k}';render()">${label}</button>`;

  const contestantCard = (c, i) => `
    <div class="col-contestant ${COL.picked === i ? 'picked' : ''}" onclick="COL.picked=${i};render()">
      ${monsterTag(c.dna, c.rarity, 56, c.hat)}
      <div class="cc-name r-${c.rarity}">${esc(c.name)}${c.is_buddy ? ' <span style="color:#e05070">&#9829;</span>' : ''}</div>
      <div class="muted" style="font-size:12px;text-transform:uppercase">${c.rarity}</div>
      <div class="cc-odds">${d.odds[i]}&times;</div>
    </div>`;

  $app().innerHTML = shell(`
    <div class="win"><span class="win-title">The Colosseum</span>
      <div class="muted" style="margin-bottom:6px">A game of chance. Back a contestant, wager gold, watch it play out.</div>
      <div class="tabs" style="justify-content:center">${tabBtn('fight', 'FIGHT')}${tabBtn('race', 'RACE')}${tabBtn('pageant', 'PAGEANT')}</div>
      <div class="col-field">${d.contestants.map(contestantCard).join('')}</div>
      <div class="formrow center"><label>wager</label>
        <div class="stepper" style="justify-content:center">
          <button class="btn" onclick="G.colWager(-5)">&minus;</button>
          <span class="val" id="col-wager">${spriteTag('icon_coin', 15)} ${COL.wager}</span>
          <button class="btn" onclick="G.colWager(5)">+</button>
        </div>
      </div>
      <div class="col-enter-wrap"><button class="btn big green" id="col-enter-btn" onclick="G.colEnter()">PLACE BET &amp; BEGIN</button></div>
      <div class="muted center" style="font-size:15px;margin-top:6px">you carry ${spriteTag('icon_coin', 14)}${d.gold} gold</div>
    </div>
    <div class="win center">
      <canvas class="col-stage" id="col-stage" width="640" height="220"></canvas>
    </div>
  `);
  hydrateSprites();
  drawColosseumIdle(kind, d.contestants);
};

G.colWager = (delta) => {
  const f = COL.field;
  COL.wager = Math.max(f.min_bet, Math.min(f.max_bet, Math.min(f.gold, COL.wager + delta)));
  const el = document.getElementById('col-wager');
  if (el) el.innerHTML = `${spriteTag('icon_coin', 15)} ${COL.wager}`;
  hydrateSprites(el);
};

/* ---- idle stage: contestants posed, waiting for a bet ---- */

function drawArenaBg(ctx, w, h, kind) {
  ctx.clearRect(0, 0, w, h);
  if (kind === 'fight') {
    const grad = ctx.createRadialGradient(w / 2, h * 0.66, 20, w / 2, h * 0.66, w * 0.65);
    grad.addColorStop(0, '#9a7a48'); grad.addColorStop(1, '#2e2014');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, w, 30);
  } else if (kind === 'race') {
    ctx.fillStyle = '#2e4a26'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.setLineDash([8, 8]);
    const lanes = 4;
    for (let i = 1; i < lanes; i++) {
      const y = (h / lanes) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let y = 0; y < h; y += 14) {
      ctx.fillStyle = (Math.floor(y / 14) % 2 === 0) ? '#e8e0d0' : '#20202c';
      ctx.fillRect(w - 18, y, 10, 14);
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#241a3a'); grad.addColorStop(1, '#4a2a5a');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a3a7a'; ctx.fillRect(0, h - 34, w, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < w; x += 40) ctx.fillRect(x, 0, 2, h - 34);
  }
}

function drawColosseumIdle(kind, contestants) {
  const cv = document.getElementById('col-stage');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const models = contestants.map(c => genMonsterModel(c.dna, c.rarity));
  drawArenaBg(ctx, W, H, kind);
  if (kind === 'fight') {
    const posX = [W * 0.28, W * 0.72];
    contestants.forEach((c, i) => {
      drawMonster(ctx, models[i], 5, Math.round(posX[i] - 30), Math.round(H * 0.62 - 60), i === 1, false, c.hat);
    });
  } else if (kind === 'race') {
    const laneH = H / contestants.length;
    contestants.forEach((c, i) => {
      drawMonster(ctx, models[i], 3, 20, Math.round(laneH * i + laneH / 2 - 18), false, false, c.hat);
    });
  } else {
    const slotW = W / contestants.length;
    contestants.forEach((c, i) => {
      drawMonster(ctx, models[i], 4, Math.round(slotW * i + slotW / 2 - 24), Math.round(H * 0.55 - 48), false, false, c.hat);
    });
  }
}

/* ---- entering & animating a bet ---- */

G.colEnter = async () => {
  if (COL.animating) return;
  const kind = COL.kind;
  let r;
  try {
    r = await api(`/colosseum/${kind}/enter`, { method: 'POST', body: { contestant: COL.picked, wager: COL.wager } });
  } catch (e) { return; }
  COL.animating = true;
  const btn = document.getElementById('col-enter-btn');
  if (btn) btn.disabled = true;
  SFX.crank();
  const done = () => { COL.animating = false; showColosseumResult(r); };
  if (kind === 'fight') animateFight(r, done);
  else if (kind === 'race') animateRace(r, done);
  else animatePageant(r, done);
};

async function showColosseumResult(r) {
  await refreshState();
  SFX[r.won ? 'fanfare' : 'error']();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="win ceremony">
    <h2>${r.won ? 'VICTORY!' : 'DEFEAT'}</h2>
    <div class="muted" style="margin:8px 0">${esc(r.contestants[r.winner].name)} took ${COL_LABELS[r.kind]}</div>
    <div class="reward-line" style="color:${r.won ? 'var(--gold-bright)' : 'var(--red)'}">${r.won ? `+${r.payout} gold` : `&minus;${r.wager} gold`}</div>
    <button class="btn big" style="margin-top:14px" onclick="this.closest('.overlay').remove();render()">CONTINUE</button>
  </div>`;
  document.body.appendChild(ov);
}

/* ---- FIGHT: a few rounds of exchanged blows in the sand ---- */

function animateFight(r, onDone) {
  const cv = document.getElementById('col-stage');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const contestants = r.contestants;
  const models = contestants.map(c => genMonsterModel(c.dna, c.rarity));
  const maxHp = r.max_hp;
  let hp = maxHp.slice();
  const posX = [W * 0.28, W * 0.72];
  const baseY = H * 0.62;
  let roundIdx = 0, roundT = 0, lastTs = null;
  let popups = [];
  let finished = false;

  function frame(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = Math.min(40, ts - lastTs);
    lastTs = ts;
    drawArenaBg(ctx, W, H, 'fight');

    if (!finished && roundIdx < r.rounds.length) {
      roundT += dt / 480;
      if (roundT >= 1) {
        const rd = r.rounds[roundIdx];
        hp = rd.hp.slice();
        popups.push({ x: posX[rd.attacker === 0 ? 1 : 0], y: baseY - 70, text: (rd.crit ? 'CRIT! ' : '') + '-' + rd.damage, life: 1, color: rd.crit ? '#f0d060' : '#e05050' });
        SFX.hit();
        roundIdx++; roundT = 0;
      }
    } else if (!finished) {
      finished = true;
      setTimeout(onDone, 500);
    }

    contestants.forEach((c, i) => {
      let x = posX[i];
      const dead = hp[i] <= 0;
      if (!finished && roundIdx < r.rounds.length) {
        const rd = r.rounds[roundIdx];
        if (rd.attacker === i) x += (i === 0 ? 1 : -1) * Math.sin(Math.min(1, roundT) * Math.PI) * 22;
      }
      const y = dead ? baseY + 14 : baseY;
      drawMonster(ctx, models[i], 5, Math.round(x - 30), Math.round(y - 60), i === 1, dead, c.hat);
      const bw = 96;
      ctx.fillStyle = '#101014'; ctx.fillRect(x - bw / 2, y - 78, bw, 8);
      const pct = Math.max(0, hp[i] / maxHp[i]);
      ctx.fillStyle = pct > 0.4 ? '#7ab55c' : '#c85050';
      ctx.fillRect(x - bw / 2 + 1, y - 77, (bw - 2) * pct, 6);
      ctx.fillStyle = '#f0d080'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText(c.name, x, y - 84);
      ctx.textAlign = 'left';
    });

    popups.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - (1 - p.life) * 24);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      p.life -= dt / 700;
    });
    popups = popups.filter(p => p.life > 0);

    if (!finished || popups.length) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---- RACE: four lanes to the finish line ---- */

function animateRace(r, onDone) {
  const cv = document.getElementById('col-stage');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const contestants = r.contestants;
  const models = contestants.map(c => genMonsterModel(c.dna, c.rarity));
  const n = contestants.length;
  const laneH = H / n;
  const finalTick = r.ticks[r.ticks.length - 1];
  const maxPos = Math.max(...finalTick, 1);
  const trackW = W - 60;
  const ticks = r.ticks.map(row => row.map(p => 20 + (p / maxPos) * trackW));
  let idx = 0;
  const total = ticks.length;

  const step = () => {
    drawArenaBg(ctx, W, H, 'race');
    const positions = ticks[Math.min(idx, total - 1)];
    contestants.forEach((c, i) => {
      const x = positions[i];
      const y = laneH * i + laneH / 2;
      drawMonster(ctx, models[i], 3, Math.round(x), Math.round(y - 18), false, false, c.hat);
      ctx.fillStyle = '#f0d080'; ctx.font = '11px monospace';
      ctx.fillText(c.name, x, y - 20);
    });
    idx++;
    if (idx <= total) {
      setTimeout(step, 90);
    } else {
      const wi = r.winner;
      ctx.fillStyle = '#f0d060'; ctx.font = 'bold 16px monospace';
      ctx.fillText('WINNER', ticks[total - 1][wi] - 8, laneH * wi + laneH / 2 - 30);
      setTimeout(onDone, 700);
    }
  };
  step();
}

/* ---- PAGEANT: the runway — they dance, they twirl, they blow kisses ---- */

function animatePageant(r, onDone) {
  const cv = document.getElementById('col-stage');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const contestants = r.contestants;
  const models = contestants.map(c => genMonsterModel(c.dna, c.rarity));
  const n = contestants.length;
  const slotW = W / n;
  const DURATION = 2600;
  let start = null;
  let crowned = false;
  let kisses = [];   // little hearts blown to the crowd
  // each contestant gets its own dance style
  const dance = contestants.map((c, i) => ({
    swayHz: 2.2 + (i % 3) * 0.7, hopHz: 3.1 + ((i + 1) % 3) * 0.8,
    phase: i * 1.7, nextKiss: 300 + Math.random() * 600,
  }));

  function frame(ts) {
    if (!start) start = ts;
    const el = ts - start;
    const t = Math.min(1, el / DURATION);
    drawArenaBg(ctx, W, H, 'pageant');
    contestants.forEach((c, i) => {
      const x = slotW * i + slotW / 2;
      const d = dance[i];
      const sec = el / 1000 + d.phase;
      const sway = Math.sin(sec * d.swayHz) * 7;                    // side-shuffle
      const hop = Math.abs(Math.sin(sec * d.hopHz)) * -6;           // bouncy little hops
      const facing = Math.sin(sec * 1.1) < 0;                       // twirl to face the other way
      const baseY = H * 0.55 - 48;
      drawMonster(ctx, models[i], 4, Math.round(x - 24 + sway), Math.round(baseY + hop), facing, false, c.hat);
      // blow a kiss now and then
      if (el > d.nextKiss && !crowned) {
        d.nextKiss = el + 500 + Math.random() * 900;
        kisses.push({ x: x + sway + (facing ? -18 : 18), y: baseY + 18, vx: (facing ? -1 : 1) * (0.4 + Math.random() * 0.5), vy: -0.7 - Math.random() * 0.4, life: 1 });
        if (Math.random() < 0.4) SFX.coin();
      }
      ctx.fillStyle = '#f0d080'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(c.name, x, H * 0.55 + 22);
      const score = r.scores[i] * t;
      const barW = slotW * 0.6, barX = x - barW / 2, barY = H - 22;
      ctx.fillStyle = '#101014'; ctx.fillRect(barX, barY, barW, 10);
      ctx.fillStyle = '#c9a24b'; ctx.fillRect(barX + 1, barY + 1, (barW - 2) * (score / 100), 8);
      ctx.fillStyle = '#fff'; ctx.font = '10px monospace';
      ctx.fillText(score.toFixed(0), x, barY - 4);
      ctx.textAlign = 'left';
    });
    // drifting hearts
    kisses.forEach(k => {
      ctx.globalAlpha = Math.max(0, k.life);
      ctx.fillStyle = '#e05070';
      ctx.fillRect(k.x, k.y, 3, 3); ctx.fillRect(k.x + 4, k.y, 3, 3);
      ctx.fillRect(k.x + 1, k.y + 2, 5, 4); ctx.fillRect(k.x + 2, k.y + 6, 3, 2);
      ctx.globalAlpha = 1;
      k.x += k.vx; k.y += k.vy; k.life -= 0.012;
    });
    kisses = kisses.filter(k => k.life > 0);

    if (t < 1 || kisses.length || !crowned) {
      if (t >= 1 && !crowned) {
        crowned = true;
        setTimeout(onDone, 900);
      }
      if (crowned) {
        const wi = r.winner;
        const x = slotW * wi + slotW / 2;
        ctx.fillStyle = '#f0d060'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
        ctx.fillText('★', x, H * 0.55 - 58);
        ctx.textAlign = 'left';
      }
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
}
