/* Chiptune SFX via WebAudio — no asset files, pure oscillators. */
const SFX = (() => {
  let ctx = null;
  let muted = localStorage.getItem('iv_mute') === '1';

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.08, when = 0, slide = 0) {
    if (muted) return;
    const a = ac(), t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.1, when = 0) {
    if (muted) return;
    const a = ac(), t = a.currentTime + when;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(), g = a.createGain();
    src.buffer = buf;
    g.gain.setValueAtTime(vol, t);
    src.connect(g).connect(a.destination);
    src.start(t);
  }

  const N = { C4: 262, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G6: 1568 };

  return {
    toggleMute() { muted = !muted; localStorage.setItem('iv_mute', muted ? '1' : '0'); return muted; },
    get muted() { return muted; },
    click() { tone(880, 0.04, 'square', 0.04); },
    coin() { tone(N.E6, 0.07, 'square', 0.06); tone(N.G6, 0.18, 'square', 0.06, 0.07); },
    buy() { this.coin(); tone(N.C5, 0.1, 'triangle', 0.06, 0.2); },
    accept() { tone(N.C5, 0.09, 'square', 0.06); tone(N.G5, 0.14, 'square', 0.06, 0.09); },
    fanfare() {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, 0.14, 'square', 0.07, i * 0.12));
      tone(N.C6, 0.5, 'triangle', 0.06, 0.55);
      [N.C4, N.G4, N.C5, N.E5].forEach((f, i) => tone(f, 0.2, 'triangle', 0.04, i * 0.12));
    },
    levelup() {
      [N.C5, N.D5, N.E5, N.G5, N.A5, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, 0.1, 'square', 0.06, i * 0.07));
      tone(N.C6, 0.7, 'triangle', 0.07, 0.6);
    },
    hit() { noise(0.08, 0.09); tone(160, 0.08, 'square', 0.06, 0, -80); },
    crit() { noise(0.12, 0.12); tone(320, 0.12, 'square', 0.08, 0, -200); tone(640, 0.1, 'square', 0.05, 0.05, -300); },
    hurt() { tone(220, 0.22, 'sawtooth', 0.08, 0, -140); },
    death() { [392, 330, 262, 196, 131].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.07, i * 0.22)); noise(0.6, 0.05, 1.1); },
    stairs() { [N.G4, N.E4, N.C4].forEach((f, i) => tone(f, 0.15, 'triangle', 0.06, i * 0.12)); },
    crank() { for (let i = 0; i < 6; i++) noise(0.03, 0.06, i * 0.09); tone(200, 0.05, 'square', 0.04, 0.55, 100); },
    reveal(rarity) {
      if (rarity === 'legendary') {
        [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, 2093].forEach((f, i) => tone(f, 0.12, 'square', 0.07, i * 0.09));
        tone(2093, 0.9, 'triangle', 0.06, 0.65);
      } else if (rarity === 'rare') {
        [N.E5, N.G5, N.C6, N.E6].forEach((f, i) => tone(f, 0.11, 'square', 0.06, i * 0.09));
      } else if (rarity === 'uncommon') {
        tone(N.G5, 0.1, 'square', 0.06); tone(N.C6, 0.2, 'square', 0.06, 0.1);
      } else {
        tone(N.C5, 0.12, 'square', 0.05); tone(N.E4, 0.2, 'triangle', 0.04, 0.12);
      }
    },
    error() { tone(140, 0.18, 'sawtooth', 0.06); },
    squeak() { tone(900 + Math.random() * 500, 0.07, 'square', 0.05, 0, 300); },
  };
})();
