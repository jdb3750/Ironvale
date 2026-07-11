/* Generic canvas chart primitives shared by the Hall's tabs. */

function drawBars(id, vals, color) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, n = vals.length;
  const max = Math.max(...vals, 1);
  ctx.clearRect(0, 0, W, H);
  const bw = Math.floor(W / n) - 4;
  vals.forEach((v, i) => {
    const h = Math.round((v / max) * (H - 24));
    const x = i * Math.floor(W / n) + 2;
    ctx.fillStyle = i === n - 1 ? '#f0d080' : color;
    ctx.fillRect(x, H - 14 - h, bw, h);
    if (v > 0) {
      ctx.fillStyle = '#776f8e';
      ctx.font = '12px monospace';
      ctx.fillText(String(v), x, H - 2);
    }
  });
}

function drawLine(id, vals, color) {
  const cv = document.getElementById(id);
  if (!cv || !vals.length) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, n = vals.length;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#33304a';
  ctx.font = '11px monospace';
  ctx.fillText(String(Math.round(max * 10) / 10), 2, 10);
  ctx.fillText(String(Math.round(min * 10) / 10), 2, H - 3);
  const px = (i) => 30 + i * ((W - 36) / Math.max(1, n - 1));
  const py = (v) => 8 + (1 - (v - min) / span) * (H - 20);
  ctx.fillStyle = color;
  let prevY = py(vals[0]);
  vals.forEach((v, i) => {
    const x = px(i), y = py(v);
    const x0 = i === 0 ? x : px(i - 1);
    const step = 3;
    for (let sx = x0; sx <= x; sx += step) {
      const t = (sx - x0) / Math.max(1, x - x0);
      ctx.fillRect(sx, prevY + (y - prevY) * t - 1, step, 3);
    }
    prevY = y;
  });
}

