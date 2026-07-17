/* Shared screen plumbing: the SCREENS registry every screen file adds to,
   small helpers, and the one true modal builder. Loads after app.js and
   before every screen file. */
const SCREENS = {};

function pickLine(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* The one way to put an overlay on screen. Returns the overlay element.
   backdropClose: false for forced-choice moments (death, safe return)
   where dismissing by tapping outside would skip the ceremony. */
function showModal(html, { backdropClose = true } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.dataset.escapeClose = String(backdropClose);
  if (backdropClose) ov.onclick = (e) => {
    if (e.target === ov && ov.getAttribute('aria-busy') !== 'true') G.closeOverlay(ov);
  };
  ov.innerHTML = html;
  document.body.appendChild(ov);
  hydrateSprites(ov);
  return prepareOverlay(ov);
}

/* In-world replacement for a native <select>: the same details/summary
   dropdown the Menagerie's hat picker uses, generalized. Renders around a
   hidden input carrying the chosen value, so any code that already reads
   document.getElementById(id).value keeps working unchanged. */
function pixelSelect(id, options, selected, ariaLabel, onChange) {
  // Degrade gracefully on an empty option set (a native <select> would too),
  // rather than throwing on esc(current.label) and blanking the whole screen.
  const current = options.find(o => o.value === selected) || options[0] || { value: '', label: '' };
  const onAttr = onChange ? ` data-onchange="${esc(onChange)}"` : '';
  return `<details class="pixel-select"${onAttr}>
    <summary class="btn small pixel-select-summary" aria-haspopup="menu" aria-label="${esc(ariaLabel)}"><span class="pixel-select-label">${esc(current.label)}</span></summary>
    <div class="pixel-select-menu" role="menu" aria-label="${esc(ariaLabel)}">
      ${options.map(o => `<button type="button" class="btn small pixel-option${o.value === current.value ? ' selected' : ''}" role="menuitemradio" aria-checked="${o.value === current.value}" data-value="${esc(o.value)}" onclick="G.pixelSelectPick(this)">${esc(o.label)}</button>`).join('')}
    </div>
    <input type="hidden" id="${esc(id)}" value="${esc(current.value)}">
  </details>`;
}

G.pixelSelectPick = (btn) => {
  const root = btn.closest('.pixel-select');
  root.querySelector('input[type="hidden"]').value = btn.dataset.value;
  root.querySelector('.pixel-select-label').textContent = btn.textContent;
  root.querySelectorAll('.pixel-option').forEach(b => {
    b.classList.toggle('selected', b === btn);
    b.setAttribute('aria-checked', String(b === btn));
  });
  root.open = false;
  const handler = root.dataset.onchange;
  if (handler && typeof G[handler] === 'function') G[handler](btn.dataset.value);
};

/* In-world replacement for window.confirm(): a pixel dialog that resolves
   true on the affirmative action, false on cancel/backdrop/Escape. Keeps
   destructive choices inside the game's own chrome instead of a system popup. */
function confirmModal(message, opts = {}) {
  const { okLabel = 'CONFIRM', cancelLabel = 'NEVER MIND', danger = false, title = 'A moment.' } = opts;
  return new Promise(resolve => {
    const ov = showModal(`<div class="win center confirm-win">
      <span class="win-title">${esc(title)}</span>
      <p class="confirm-msg">${esc(message)}</p>
      <div class="confirm-actions">
        <button type="button" class="btn ${danger ? 'danger' : 'green'}" data-confirm-ok>${esc(okLabel)}</button>
        <button type="button" class="btn small" data-confirm-cancel>${esc(cancelLabel)}</button>
      </div>
    </div>`, { backdropClose: false });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      G.closeOverlay(ov);
      resolve(result);
    };
    ov.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
    ov.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    ov.addEventListener('click', (e) => { if (e.target === ov) finish(false); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  });
}
