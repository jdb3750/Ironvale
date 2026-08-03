import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const context = vm.createContext({
  console,
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
});
vm.runInContext(readFileSync(new URL('static/js/pixel.js', ROOT), 'utf8'), context);
vm.runInContext(`
  globalThis.__bodyMapTag = bodyMapTag;
  globalThis.__drawMuscleMap = drawMuscleMap;
  globalThis.__hydrateSprites = hydrateSprites;
  globalThis.__muscleColors = MUSCLE_COLORS;
  globalThis.__muscleMapMuscles = MUSCLE_MAP_MUSCLES;
  globalThis.__muscleMapRows = MUSCLE_MAP_ROWS;
  globalThis.__muscleMapTag = muscleMapTag;
`, context);

function fakeCanvas(width = 272, height = 256) {
  const fills = [];
  const drawingContext = {
    fillStyle: '',
    clearRect() {},
    fillRect(x, y, w, h) {
      fills.push({ color: this.fillStyle, h, w, x, y });
    },
  };
  return {
    dataset: {},
    fills,
    getContext: () => drawingContext,
    height,
    width,
  };
}

function colorAtMuscle(canvas, muscle) {
  const mapEntries = Object.entries(context.__muscleMapMuscles);
  const [character] = mapEntries.find(([, name]) => name === muscle);
  const y = context.__muscleMapRows.findIndex(row => row.includes(character));
  const x = context.__muscleMapRows[y].indexOf(character);
  const scale = canvas.width / context.__muscleMapRows[0].length;
  return canvas.fills.find(fill => fill.x === x * scale && fill.y === y * scale).color;
}

test('muscle map lights every source muscle in its own primary colour', () => {
  const entries = Object.entries(context.__muscleMapMuscles);
  assert.equal(entries.length, 17);
  assert.equal(new Set(Object.values(context.__muscleColors)).size, 17);

  for (const [, muscle] of entries) {
    const canvas = fakeCanvas();
    context.__drawMuscleMap(canvas, [muscle], []);
    assert.equal(colorAtMuscle(canvas, muscle), context.__muscleColors[muscle], muscle);
  }
});

test('muscle map distinguishes primary, secondary, unlit, and structure pixels', () => {
  const primary = fakeCanvas();
  context.__drawMuscleMap(primary, ['lower back'], []);
  const secondary = fakeCanvas();
  context.__drawMuscleMap(secondary, [], ['lower back']);
  const unlit = fakeCanvas();
  context.__drawMuscleMap(unlit, [], []);
  const both = fakeCanvas();
  context.__drawMuscleMap(both, ['lower back'], ['lower back']);
  const middleBack = fakeCanvas();
  context.__drawMuscleMap(middleBack, ['middle back'], []);

  const primaryColor = colorAtMuscle(primary, 'lower back');
  const secondaryColor = colorAtMuscle(secondary, 'lower back');
  const unlitColor = colorAtMuscle(unlit, 'lower back');
  assert.notEqual(primaryColor, secondaryColor);
  assert.notEqual(secondaryColor, unlitColor);
  assert.equal(colorAtMuscle(both, 'lower back'), primaryColor);
  assert.notEqual(colorAtMuscle(middleBack, 'middle back'), primaryColor);

  const structureY = context.__muscleMapRows.findIndex(row => row.includes('#'));
  const structureX = context.__muscleMapRows[structureY].indexOf('#');
  const allMuscles = Object.values(context.__muscleMapMuscles);
  const everything = fakeCanvas();
  context.__drawMuscleMap(everything, allMuscles, allMuscles);
  assert.equal(
    everything.fills.find(fill => fill.x === structureX * 4 && fill.y === structureY * 4).color,
    '#272735',
  );
});

test('muscle map tag and hydration preserve muscle names containing spaces at 3x', () => {
  const html = context.__muscleMapTag(['lower back', 'middle back'], ['glutes'], 204);
  assert.match(html, /data-primary-muscles="%5B%22lower%20back%22%2C%22middle%20back%22%5D"/);
  assert.match(html, /data-secondary-muscles="%5B%22glutes%22%5D"/);
  assert.match(html, /width="204" height="192"/);

  const canvas = fakeCanvas(204, 192);
  canvas.dataset.primaryMuscles = encodeURIComponent(JSON.stringify(['lower back', 'middle back']));
  canvas.dataset.secondaryMuscles = encodeURIComponent(JSON.stringify(['glutes']));
  const root = {
    querySelectorAll(selector) {
      return selector === 'canvas[data-musclemap]' ? [canvas] : [];
    },
  };
  context.__hydrateSprites(root);
  assert.equal(colorAtMuscle(canvas, 'lower back'), context.__muscleColors['lower back']);
  assert.equal(colorAtMuscle(canvas, 'middle back'), context.__muscleColors['middle back']);
  assert.equal(canvas.width / 68, 3);
});

test('the existing seven-group map and the two giver callers keep their contract', () => {
  assert.equal(
    context.__bodyMapTag(['back', 'arms'], 78),
    '<canvas data-bodymap="back,arms" width="78" height="60" style="width:78px;height:60px;image-rendering:pixelated"></canvas>',
  );
  assert.equal(
    context.__bodyMapTag(['legs'], 130),
    '<canvas data-bodymap="legs" width="130" height="100" style="width:130px;height:100px;image-rendering:pixelated"></canvas>',
  );

  const giver = readFileSync(new URL('static/js/giver.js', ROOT), 'utf8');
  const hall = readFileSync(new URL('static/js/hall.js', ROOT), 'utf8');
  assert.equal((giver.match(/bodyMapTag\([^\n]+, 78\)/g) || []).length, 2);
  assert.equal((hall.match(/bodyMapTag\(/g) || []).length, 0);
  assert.equal((hall.match(/muscleMapTag\([^\n]+, 204\)/g) || []).length, 2);
});
