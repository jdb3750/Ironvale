/* The Undercroft — gate + crawler UI. Isaac rules: everything is found below,
   nothing leaves. Only looted gold banks on retire. */

const CELL_SPRITES = {
  entrance: 'icon_up', stairs: 'icon_stairs', monster: 'icon_skull',
  chest: 'icon_chest', shrine: 'icon_shrine', merchant: 'pip', relic: 'icon_relic',
};
const DIRECTION_NAMES = { n: 'north', s: 'south', e: 'east', w: 'west' };

let dlogHistory = [];
let dungeonActionPending = false;
RESETS.push(() => {
  dlogHistory = [];
  dungeonActionPending = false;
});

function setDungeonActionBusy(busy) {
  document.querySelectorAll('.dungeon-action').forEach(control => {
    control.disabled = busy;
    control.setAttribute('aria-busy', String(busy));
  });
}

SCREENS.undercroft = async function () {
  const routeToken = captureRouteToken();
  const d = await api('/dungeon');
  if (!isRouteTokenCurrent(routeToken)) return;
  if (d.state) { renderDungeon(d.state, d.stats, d.theme); return; }
  const revealGateRules = !window.matchMedia('(max-width: 719px)').matches;

  // phones seat the Warden below the gate table, like the quest givers —
  // his typewriter dialog reflows its window and would shove DESCEND around
  const heskWin = `
    <div class="win">
      <div class="npc-head">
        ${portraitTag('hesk', 128)}
        <div class="dialog"><div class="npc-name">Warden Hesk, Keeper of the Undercroft</div><div id="dlg"></div></div>
      </div>
    </div>`;
  $app().innerHTML = shell(`
    ${isCompactPhone() ? '' : heskWin}
    <div class="win"><span class="win-title">The Descent</span>
      <div class="dungeon-gate">
        <table class="rpg">
          <tr><td>Entry toll</td><td>${d.enter_cost} vigor <span class="muted">(you have ${d.vigor})</span></td></tr>
          <tr><td>You will start at</td><td>floor ${d.resume_floor}</td></tr>
          <tr><td>Your training grants</td><td>${d.stats.max_hp} HP &middot; ${d.stats.atk} ATK &middot; ${d.stats.def} DEF &middot; ${d.stats.luck} LCK</td></tr>
        </table>
        <details class="phone-disclosure dungeon-gate-rules" ${revealGateRules ? 'open' : ''}>
          <summary>RULES OF THE UNDERCROFT</summary>
          <div class="phone-disclosure-content">
            <hr class="rule">
            <div class="muted" style="font-size:18px">
              &#9656; You descend with nothing. Weapons, trinkets and potions are all found below:
                Pip trades on every floor, every floor holds a relic pedestal, and chests hide the rest.<br>
              &#9656; <b style="color:var(--gold-bright)">Nothing leaves the dungeon.</b> Retire at stairs or entrance and only your looted gold banks.<br>
              &#9656; <span style="color:var(--red)">Die</span>, and even the gold stays down there — and your depth resets to floor 1.<br>
              &#9656; Vigor comes only from completed quests. Sweat above, spend below.
            </div>
          </div>
        </details>
        <div class="dungeon-gate-primary" style="margin-top:12px">
          <button type="button" class="btn big dungeon-action ${d.vigor >= d.enter_cost ? 'green' : ''}" ${d.vigor >= d.enter_cost ? '' : 'disabled'}
            onclick="G.enterDungeon()">DESCEND (&minus;${d.enter_cost} VIGOR)</button>
          ${d.vigor < d.enter_cost ? '<div class="muted center" style="margin-top:6px">not enough vigor — go complete a quest</div>' : ''}
        </div>
      </div>
    </div>
    ${isCompactPhone() ? heskWin : ''}
  `);
  typewrite(document.getElementById('dlg'),
    'Empty pockets, full heart — that is how you enter. The dark provides the rest, at its own prices.',
    14, npcPortraitEl());
};

G.enterDungeon = async () => {
  if (dungeonActionPending) return;
  const routeToken = captureRouteToken();
  const profileToken = captureProfileToken();
  dungeonActionPending = true;
  setDungeonActionBusy(true);
  try {
    const r = await api('/dungeon/enter', { method: 'POST' });
    if (!reconcileMutationState({
      character: r.character,
      combat_stats: r.stats,
      dungeon_active: true,
    }, profileToken)) return;
    if (!isRouteTokenCurrent(routeToken)) return;
    SFX.stairs();
    dlogHistory = r.state.log.slice();
    renderDungeon(r.state, r.stats, r.theme);
  } finally {
    dungeonActionPending = false;
    if (isRouteTokenCurrent(routeToken)) setDungeonActionBusy(false);
  }
};

function gearLine(st) {
  const cat = S.itemsCatalog || {};
  const g = st.gear || {};
  const parts = ['weapon', 'armor', 'charm']
    .filter(s => g[s])
    .map(s => `<span style="color:var(--gold-bright)">${esc((cat[g[s]] || {}).name || g[s])}</span>`);
  const tk = (st.trinkets || []).length;
  if (tk) parts.push(`<span style="color:var(--blue)">${tk} trinket${tk > 1 ? 's' : ''}</span>`);
  return parts.length ? parts.join(' &middot; ') : '<span class="muted">bare-handed, as you arrived</span>';
}

function renderDungeon(st, stats, theme) {
  const hpPct = Math.max(0, Math.round(100 * st.hp / stats.max_hp));
  let grid = '';
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const cell = st.cells[`${x},${y}`];
      const isPlayer = st.px === x && st.py === y;
      const adjacent = !st.combat && cell && cell.seen && Math.abs(x - st.px) + Math.abs(y - st.py) === 1;
      let inner = '';
      let cls = 'dcell';
      if (cell && cell.seen) {
        cls += ' seen' + (cell.cleared ? ' cleared' : '') + (adjacent ? ' adjacent' : '');
        if (isPlayer) { cls += ' player'; inner = '<span style="color:var(--gold-bright)">@</span>'; }
        else if (cell.type === 'trap' || cell.type === 'empty') inner = `<span class="muted">${cell.cleared ? (cell.type === 'trap' ? '<span style="color:var(--red)">^</span>' : '&middot;') : '&middot;'}</span>`;
        else if (cell.type === 'monster' && cell.cleared) inner = '<span class="muted">&times;</span>';
        else if (cell.type === 'relic' && cell.cleared) inner = '<span class="muted">&middot;</span>';
        else if (CELL_SPRITES[cell.type]) inner = spriteTag(CELL_SPRITES[cell.type], 26);
        else inner = '<span class="muted">?</span>';
      }
      const dir = adjacent ? (x > st.px ? 'e' : x < st.px ? 'w' : y > st.py ? 's' : 'n') : '';
      grid += dir
        ? `<button type="button" class="${cls}" style="padding:0;font:inherit;color:inherit;border-radius:0" aria-label="Move ${DIRECTION_NAMES[dir]}" onclick="G.dmove('${dir}')">${inner}</button>`
        : `<div class="${cls}">${inner}</div>`;
    }
  }

  const here = st.cells[`${st.px},${st.py}`];
  const atStairs = here && here.type === 'stairs';
  const atEntrance = here && here.type === 'entrance';
  const bossPending = atStairs && st.boss_floor && !here.boss_dead;
  const cat = S.itemsCatalog || {};

  let combatBox = '';
  if (st.combat) {
    const m = st.combat;
    const mpct = Math.max(0, Math.round(100 * m.hp / m.max_hp));
    combatBox = `<div class="win combat-box"><span class="win-title" style="color:var(--red)">${m.boss ? '&#9733; ' : ''}Combat</span>
      ${spriteTag(m.sprite, 96)}
      <div class="mon-name">${esc(m.name)}</div>
      <div class="hpbar" style="max-width:220px;margin:6px auto"><div style="width:${mpct}%"></div><span>${m.hp}/${m.max_hp}</span></div>
      <div class="combat-actions">
        <button type="button" class="btn dungeon-action" onclick="G.dact({action:'attack'})">ATTACK</button>
        <button type="button" class="btn dungeon-action" onclick="G.dact({action:'brace'})">BRACE</button>
        <button type="button" class="btn dungeon-action" onclick="G.dItems()">ITEM</button>
        <button type="button" class="btn danger dungeon-action" onclick="G.dact({action:'flee'})">FLEE</button>
      </div>
    </div>`;
  }

  let pipPanel = '';
  if (here && here.type === 'merchant' && !st.combat) {
    const stock = st.shop_stock || [];
    pipPanel = `<div class="pip-panel">
      <div class="npc-head" style="align-items:center;gap:10px">
        ${portraitTag('pip', 64)}
        <div><span class="npc-name" style="color:var(--gold-bright)">Pip, somehow, down here</span><br>
        <span class="muted" style="font-size:17px">"Every floor, friend. Loot gold only — cave rules." (&#9670;${st.loot_gold} looted)</span></div>
      </div>
      ${stock.length ? stock.map(s => {
        const it = s.kind === 'trinket' ? (TRINKET_CACHE[s.id] || { name: s.id, sprite: 'rock', rarity: 'uncommon', desc: 'a mysterious trinket' })
          : (cat[s.id] || { name: s.id, sprite: 'rock', rarity: 'common', desc: '' });
        return `<div class="shop-row">
          <span class="icon">${spriteTag(it.sprite, 30)}</span>
          <span class="grow"><span class="s-name r-${it.rarity}">${esc(it.name)}</span>
            ${s.kind !== 'item' ? `<span class="chip" style="font-size:13px">${s.kind}</span>` : ''}<br>
            <span class="s-desc">${esc(it.desc)}</span></span>
          <span class="price">&#9670;${s.price}</span>
          <button type="button" class="btn small dungeon-action" style="min-width:0" ${st.loot_gold >= s.price ? '' : 'disabled'}
            onclick="G.dact({action:'buy',item_id:'${s.id}'})">BUY</button>
        </div>`;
      }).join('') : '<div class="muted" style="margin-top:6px">"Sold out! Marvelous doing business."</div>'}
    </div>`;
  }

  let relicPanel = '';
  if (here && here.type === 'relic' && !here.cleared && st.relic && !st.combat) {
    const r = st.relic;
    const it = r.kind === 'trinket' ? (TRINKET_CACHE[r.id] || { name: 'a trinket', sprite: 'rock', rarity: 'uncommon', desc: '' })
      : (cat[r.id] || { name: r.id, sprite: 'rock', rarity: 'common', desc: '' });
    const replacing = r.kind === 'gear' && st.gear[r.slot] ? ` — replaces your ${esc((cat[st.gear[r.slot]] || {}).name || '')}` : '';
    relicPanel = `<div class="pip-panel" style="border-color:var(--gold)">
      <div class="center">
        <div class="muted">a pedestal in pale light bears:</div>
        <div style="display:flex;justify-content:center;margin:8px 0">${spriteTag(it.sprite, 48)}</div>
        <div class="r-${it.rarity}" style="font-size:24px">${esc(it.name)}</div>
        <div class="muted" style="font-size:17px">${esc(it.desc)}${replacing}</div>
        <div style="margin-top:8px;display:flex;gap:8px;justify-content:center">
          <button type="button" class="btn wide green dungeon-action" onclick="G.dact({action:'take_relic'})">TAKE IT</button>
        </div>
      </div>
    </div>`;
  }

  $app().innerHTML = header() + `
    <div class="win tight">
      <div class="dstats">
        <span>FLOOR <b style="color:var(--gold-bright)">${st.floor}</b>${st.boss_floor ? ' <span style="color:var(--red)">&#9733;</span>' : ''}${theme ? ` <span style="color:${theme.accent}">— ${esc(theme.name).toUpperCase()}</span>` : ''}</span>
        <span>ATK ${stats.atk + (st.buff_atk || 0)}</span><span>DEF ${stats.def + (st.buff_def || 0)}</span>
        <span style="color:var(--gold-bright)">&#9670;${st.loot_gold} looted</span>
      </div>
      <div class="hpbar" style="margin-top:6px"><div style="width:${hpPct}%"></div><span>HP ${st.hp}/${stats.max_hp}</span></div>
      <div class="center" style="font-size:16px;margin-top:4px">${gearLine(st)}
        ${(st.trinkets || []).length ? `<button class="btn small" style="min-width:0;padding:0 8px" onclick="G.dGear()">inspect</button>` : ''}</div>
    </div>
    ${combatBox}
    ${pipPanel}
    ${relicPanel}
    ${!st.combat ? `<div class="win tight"><div class="dmap">${grid}</div>
      <div class="dpad">
        <span></span><button type="button" class="btn dungeon-action" aria-label="Move north" onclick="G.dmove('n')">&#9650;</button><span></span>
        <button type="button" class="btn dungeon-action" aria-label="Move west" onclick="G.dmove('w')">&#9668;</button>
        <button type="button" class="btn small dungeon-action" style="min-width:0" onclick="G.dItems()">USE</button>
        <button type="button" class="btn dungeon-action" aria-label="Move east" onclick="G.dmove('e')">&#9658;</button>
        <span></span><button type="button" class="btn dungeon-action" aria-label="Move south" onclick="G.dmove('s')">&#9660;</button><span></span>
      </div>
      <div class="center" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${atStairs && !bossPending ? `<button type="button" class="btn green dungeon-action" onclick="G.dact({action:'descend'})">DESCEND &#9660;</button>` : ''}
        ${bossPending ? `<span class="muted">something vast sleeps on these stairs...</span>` : ''}
        ${(atStairs || atEntrance) ? `<button type="button" class="btn dungeon-action" onclick="G.dRetire()">RETIRE &amp; BANK GOLD</button>` : ''}
      </div>
    </div>` : ''}
    <div class="dlog" id="dlog">${dlogHistory.slice(-30).map(l => `<p>${esc(l)}</p>`).join('')}</div>
  ` + footer();
  hydrateSprites();
  const lg = document.getElementById('dlog');
  if (lg) lg.scrollTop = lg.scrollHeight;
}

/* trinket catalog cache, fetched once */
const TRINKET_CACHE = {};
(async () => {
  try {
    const t = await fetch('/api/trinkets').then(r => r.json());
    Object.assign(TRINKET_CACHE, t.trinkets);
  } catch (e) { /* non-fatal */ }
})();

G.dmove = (dir) => G.dact({ action: 'move', dir });

G.dGear = async () => {
  const routeToken = captureRouteToken();
  const d = (await api('/dungeon')).state;
  if (!isRouteTokenCurrent(routeToken) || !d) return;
  const cat = S.itemsCatalog || {};
  const gearRows = ['weapon', 'armor', 'charm'].map(s => {
    const iid = d.gear[s];
    const it = iid ? cat[iid] : null;
    return `<div class="shop-row"><span class="muted" style="width:70px;text-transform:uppercase;font-size:14px">${s}</span>
      ${it ? `<span class="icon">${spriteTag(it.sprite, 26)}</span><span class="grow r-${it.rarity}">${esc(it.name)}</span>` : '<span class="grow muted">none</span>'}</div>`;
  }).join('');
  const tkRows = (d.trinkets || []).map(tid => {
    const t = TRINKET_CACHE[tid] || { name: tid, sprite: 'rock', desc: '' };
    return `<div class="shop-row"><span class="icon">${spriteTag(t.sprite, 26)}</span>
      <span class="grow"><span class="s-name">${esc(t.name)}</span><br><span class="s-desc">${esc(t.desc)}</span></span></div>`;
  }).join('');
  showModal(`<div class="win"><span class="win-title">This Run's Findings</span>
    ${gearRows}${tkRows || ''}
    <div class="muted center" style="font-size:16px;margin-top:6px">none of it leaves the Undercroft</div>
    <div class="center" style="margin-top:8px"><button class="btn small" style="min-width:0" onclick="G.closeOverlay(this.closest('.overlay'))">close</button></div>
  </div>`);
};

async function runDungeonAction(body, routeToken, profileToken = captureProfileToken()) {
  let r;
  try {
    r = await api('/dungeon/action', { method: 'POST', body });
  } catch (e) { return; }
  if (!reconcileMutationState({
    character: r.character,
    combat_stats: r.stats,
    dungeon_active: r.state != null,
  }, profileToken)) return;
  if (!isRouteTokenCurrent(routeToken)) return;
  (r.log || []).forEach(l => dlogHistory.push(l));

  if (r.captured) {
    const revealWork = createRouteWork(routeToken);
    let revealed = false;
    const revealCaptured = () => {
      if (revealed || !revealWork.active) return;
      revealed = true;
      revealWork.cancel();
      SFX.reveal(r.captured.rarity);
      showModal(`<div class="win mon-card gacha-card">
        <div class="muted">it stops fighting. it looks up at you.</div>
        <div style="display:flex;justify-content:center;margin:10px 0">${monsterTag(r.captured.dna, r.captured.rarity, 100)}</div>
        <div class="r-${r.captured.rarity}" style="font-size:26px">${esc(r.captured.name)}</div>
        <div class="muted" style="font-size:16px">${esc(r.captured.personality)} &middot; joins your menagerie</div>
        <button type="button" class="btn big dungeon-action" style="margin-top:10px" onclick="G.closeOverlay(this.closest('.overlay'))">WELCOME, STRANGE ONE</button>
      </div>`);
    };
    if (prefersReducedMotion()) revealCaptured();
    else {
      revealWork.addCleanup(onReducedMotionRequested(revealCaptured));
      revealWork.timeout(revealCaptured, 500);
    }
  }

  // sfx by log content
  const logstr = (r.log || []).join(' ');
  if (/CRITICAL/.test(logstr)) SFX.crit();
  else if (/You strike|BOOM/.test(logstr)) SFX.hit();
  if (/Bought|You take the/.test(logstr)) SFX.buy();
  if (/hits for|punishes|bite for|strikes first/.test(logstr)) SFX.hurt();
  if (/falls!|in pieces/.test(logstr)) SFX.coin();
  if (body.action === 'descend') SFX.stairs();

  if (r.death) {
    SFX.death();
    await refreshState();
    if (!isRouteTokenCurrent(routeToken)) return;
    const dd = r.death;
    showModal(`<div class="win ceremony">
      <div class="youdied">YOU DIED</div>
      <p class="muted" style="margin:12px 0">on floor ${dd.floor} of the Undercroft</p>
      <div style="text-align:left;font-size:19px">
        ${dd.lost_gold ? `<div>&#9670; ${dd.lost_gold} looted gold — stays in the dark</div>` : ''}
        <div>everything you found remains below</div>
        <div>your depth resets to floor 1</div>
      </div>
      <p class="muted" style="margin-top:10px">Sweat buys another descent. The Undercroft will wait.</p>
      <button class="btn big" onclick="G.closeOverlay(this.closest('.overlay'),()=>nav('town'))">RETURN TO TOWN</button>
    </div>`, { backdropClose: false });
    return;
  }
  if (r.retired) {
    SFX.fanfare();
    await refreshState();
    if (!isRouteTokenCurrent(routeToken)) return;
    showModal(`<div class="win ceremony">
      <h2>SAFE RETURN</h2>
      <div class="reward-line" style="animation-delay:0.2s;color:var(--gold-bright)">&#9670; +${r.banked_gold ?? 0} gold banked</div>
      <p class="muted" style="margin-top:8px">The gear stayed below, as it must. Next descent starts at floor ${r.floor}.</p>
      <button class="btn big" onclick="G.closeOverlay(this.closest('.overlay'),()=>nav('town'))">TO TOWN</button>
    </div>`, { backdropClose: false });
    return;
  }
  renderDungeon(r.state, r.stats, r.theme);
}

G.dact = async (body) => {
  if (dungeonActionPending) return;
  const routeToken = captureRouteToken();
  const profileToken = captureProfileToken();
  dungeonActionPending = true;
  setDungeonActionBusy(true);
  try {
    await runDungeonAction(body, routeToken, profileToken);
  } finally {
    dungeonActionPending = false;
    if (isRouteTokenCurrent(routeToken)) setDungeonActionBusy(false);
  }
};

G.dRetire = async () => {
  if (await confirmModal('Retire from the expedition? Looted gold banks; everything else stays below.',
      { title: 'Leave the Undercroft?', okLabel: 'RETIRE & BANK' })) {
    G.dact({ action: 'retire' });
  }
};

G.dItems = async () => {
  const routeToken = captureRouteToken();
  const d = (await api('/dungeon')).state;
  if (!isRouteTokenCurrent(routeToken) || !d) return;
  const cat = S.itemsCatalog || {};
  const entries = Object.entries(d.items || {});
  showModal(`<div class="win"><span class="win-title">Use Item</span>
    ${entries.length ? entries.map(([iid, qty]) => {
      const it = cat[iid] || { name: iid, sprite: 'rock', desc: '' };
      return `<div class="shop-row">
      <span class="icon">${spriteTag(it.sprite, 30)}</span>
      <span class="grow"><span class="s-name">${esc(it.name)} <span class="qty muted">&times;${qty}</span></span><br><span class="s-desc">${esc(it.desc)}</span></span>
      <button type="button" class="btn small dungeon-action" style="min-width:0" onclick="G.closeOverlay(this.closest('.overlay'),()=>G.dact({action:'use',item_id:'${iid}'}))">USE</button>
    </div>`;
    }).join('') : '<p class="muted">Empty pockets. Pip trades on every floor; chests hide the rest.</p>'}
    <div class="center" style="margin-top:8px"><button class="btn small" style="min-width:0" onclick="G.closeOverlay(this.closest('.overlay'))">close</button></div>
  </div>`);
};

/* keyboard controls */
document.addEventListener('keydown', (e) => {
  if (S.screen !== 'undercroft' || document.querySelector('.overlay')) return;
  const map = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' };
  if (map[e.key] && document.querySelector('.dmap')) { e.preventDefault(); G.dmove(map[e.key]); }
});
