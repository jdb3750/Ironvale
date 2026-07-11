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
  if (backdropClose) ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = html;
  document.body.appendChild(ov);
  hydrateSprites(ov);
  return ov;
}
