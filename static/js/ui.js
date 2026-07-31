/* Shared screen plumbing: the SCREENS registry every screen file adds to,
   small helpers, and the one true modal builder. Loads after app.js and
   before every screen file. */
const SCREENS = {};

function pickLine(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* The one way to put an overlay on screen. Returns the overlay element.
   backdropClose: false for forced-choice moments (death, safe return)
   where dismissing by tapping outside would skip the ceremony. */
/* The little colored tag naming a quest's activity type. Endurance/climb
   offers carry an explicit modality; lift quests are tagged by their giver
   (display only — adding a modality field to lift offers would flip their
   matching from sets-based to time-based). Doctrine offers skip it: the
   DOCTRINE chip already says "lifting" and three chips is a crowd. */
function modalityChip(modality, giver, isProgram) {
  if (modality) return `<span class="chip mod-${modality}">${modality}</span>`;
  if (!isProgram && giver === 'strength') {
    return '<span class="chip mod-lift">lift</span>';
  }
  return '';
}

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
function pixelSelect(id, options, selected, ariaLabel, onChange, placeholder, disabled = false) {
  // Degrade gracefully on an empty option set (a native <select> would too),
  // rather than throwing on esc(current.label) and blanking the whole screen.
  // With a placeholder, an unmatched selection shows the prompt text and an
  // empty hidden value — the caller decides whether empty is submittable.
  const current = options.find(o => o.value === selected)
    || (placeholder ? { value: '', label: placeholder } : options[0] || { value: '', label: '' });
  const onAttr = onChange ? ` data-onchange="${esc(onChange)}"` : '';
  const disabledAttr = disabled ? ' aria-disabled="true" tabindex="-1"' : '';
  const disabledInput = disabled ? ' disabled' : '';
  return `<details class="pixel-select"${onAttr}>
    <summary class="btn small pixel-select-summary" aria-haspopup="menu" aria-label="${esc(ariaLabel)}"${disabledAttr}><span class="pixel-select-label">${esc(current.label)}</span></summary>
    <div class="pixel-select-menu" role="menu" aria-label="${esc(ariaLabel)}">
      ${options.map(o => `<button type="button" class="btn small pixel-option${o.value === current.value ? ' selected' : ''}" role="menuitemradio" aria-checked="${o.value === current.value}" data-value="${esc(o.value)}" onclick="G.pixelSelectPick(this)">${esc(o.label)}</button>`).join('')}
    </div>
    <input type="hidden" id="${esc(id)}" value="${esc(current.value)}"${disabledInput}>
  </details>`;
}

const FLOATING_PICKER_SELECTOR = '.pixel-select, .hat-picker';
const FLOATING_PICKER_MENU_SELECTOR = '.pixel-select-menu, .hat-picker-menu';
const FLOATING_PICKER_MAX_HEIGHT = 230;

function resetFloatingPicker(root) {
  root.classList.remove('picker-opens-up');
  const menu = root.querySelector(FLOATING_PICKER_MENU_SELECTOR);
  if (menu) {
    menu.style.removeProperty('max-block-size');
    menu.style.removeProperty('--floating-picker-inline-offset');
  }
}

function layoutFloatingPicker(root) {
  if (!root.open) {
    resetFloatingPicker(root);
    return;
  }
  const summary = root.querySelector('summary');
  const menu = root.querySelector(FLOATING_PICKER_MENU_SELECTOR);
  if (!summary || !menu) return;

  const edge = 8;
  const summaryRect = summary.getBoundingClientRect();
  const dock = document.querySelector('.phone-dock');
  const dockRect = dock?.getBoundingClientRect();
  const dockTop = dockRect && dockRect.height > 0 ? dockRect.top : window.innerHeight;
  const overlayRect = root.closest('.overlay .win')?.getBoundingClientRect();
  const topLimit = Math.max(edge, overlayRect?.top ?? edge);
  const bottomLimit = Math.min(dockTop - edge, overlayRect?.bottom ?? window.innerHeight - edge);
  const spaceAbove = Math.max(0, summaryRect.top - topLimit);
  const spaceBelow = Math.max(0, bottomLimit - summaryRect.bottom);
  const wantedHeight = Math.min(FLOATING_PICKER_MAX_HEIGHT, menu.scrollHeight + 4);
  const opensUp = spaceBelow < wantedHeight && spaceAbove > spaceBelow;
  const availableHeight = opensUp ? spaceAbove : spaceBelow;

  root.classList.toggle('picker-opens-up', opensUp);
  menu.style.maxBlockSize = `${Math.min(FLOATING_PICKER_MAX_HEIGHT, availableHeight)}px`;
  menu.style.removeProperty('--floating-picker-inline-offset');
  const menuRect = menu.getBoundingClientRect();
  let inlineOffset = 0;
  if (menuRect.right > window.innerWidth - edge) {
    inlineOffset = window.innerWidth - edge - menuRect.right;
  }
  if (menuRect.left + inlineOffset < edge) {
    inlineOffset += edge - menuRect.left - inlineOffset;
  }
  menu.style.setProperty('--floating-picker-inline-offset', `${inlineOffset}px`);
}

function layoutOpenFloatingPickers() {
  document.querySelectorAll('.pixel-select[open], .hat-picker[open]').forEach(layoutFloatingPicker);
}

// Menu invariant: only floating pickers are mutually exclusive; ordinary
// details disclosures remain independent and may stay open together.
function closeFloatingPickers(except = null) {
  document.querySelectorAll('.pixel-select[open], .hat-picker[open]').forEach(root => {
    if (root !== except) root.open = false;
  });
}

if (typeof MutationObserver === 'function') {
  const floatingPickerObserver = new MutationObserver(records => {
    records.forEach(record => {
      if (record.target.matches?.(FLOATING_PICKER_SELECTOR)) {
        if (record.target.open) closeFloatingPickers(record.target);
        requestAnimationFrame(() => layoutFloatingPicker(record.target));
      }
    });
  });
  floatingPickerObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['open'],
    subtree: true,
  });
}
document.addEventListener('click', event => {
  if (!event.target.closest?.(FLOATING_PICKER_SELECTOR)) closeFloatingPickers();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const openPicker = document.querySelector('.pixel-select[open], .hat-picker[open]');
  if (!openPicker) return;
  event.preventDefault();
  event.stopPropagation();
  openPicker.open = false;
  openPicker.querySelector('summary')?.focus();
}, true);
window.addEventListener('resize', layoutOpenFloatingPickers, { passive: true });
window.addEventListener('scroll', layoutOpenFloatingPickers, { capture: true, passive: true });

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
