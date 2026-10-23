import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../src/blocks/blocks.js';
import { liftAt, columnTop, VENT_REACH, GLIDE_FALL } from '../src/world/wind.js';
import { Player } from '../src/player/player.js';
import { makeStore } from './helpers.js';

const GROUND = 40; // stone below, a vent at (0, GROUND, 0), open sky above

function ventWorld(wx, wy, wz) {
  if (wy === GROUND && wx === 0 && wz === 0) return B.WIND_VENT;
  return wy <= GROUND ? B.STONE : B.AIR;
}

// keys held down -> an object shaped like core/input.js
function keys(...held) {
  return { dx: 0, dy: 0, down: (code) => held.includes(code) };
}

function run(player, input, seconds, each = () => {}) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    player.update(input, dt, false);
    if (each(player) === false) return;
  }
}

test('a vent lifts the column above it and nothing beside it', () => {
  const w = makeStore(ventWorld);
  assert.equal(liftAt(w, 0.5, GROUND + 1, 0.5), 1);
  assert.equal(liftAt(w, 0.5, GROUND + 40, 0.5), 1);
  assert.equal(liftAt(w, 1.5, GROUND + 1, 0.5), 0);
  assert.equal(liftAt(w, 0.5, GROUND + 1, -0.5), 0);
  // the push fades over the last few blocks and is gone past the reach
  const nearTop = liftAt(w, 0.5, GROUND + 1 + VENT_REACH - 3, 0.5);
  assert.ok(nearTop > 0 && nearTop < 1, `near the top: ${nearTop}`);
  assert.equal(liftAt(w, 0.5, GROUND + 2 + VENT_REACH, 0.5), 0);
  assert.equal(columnTop(w, 0, GROUND, 0), GROUND + VENT_REACH);
});

test('a solid block caps the column; plants and torches do not', () => {
  const w = makeStore(ventWorld);
  w.setBlock(0, GROUND + 1, 0, B.TALL_GRASS);
  w.setBlock(0, GROUND + 5, 0, B.TORCH);
  assert.equal(liftAt(w, 0.5, GROUND + 10, 0.5), 1);
  w.setBlock(0, GROUND + 20, 0, B.OAK_PLANKS);
  assert.equal(columnTop(w, 0, GROUND, 0), GROUND + 20);
  assert.equal(liftAt(w, 0.5, GROUND + 15, 0.5), 1);
  assert.equal(liftAt(w, 0.5, GROUND + 25, 0.5), 0);
});

test('water stops the wind', () => {
  const w = makeStore(ventWorld);
  w.setBlock(0, GROUND + 3, 0, B.WATER);
  assert.equal(liftAt(w, 0.5, GROUND + 3.5, 0.5), 0);
  assert.equal(liftAt(w, 0.5, GROUND + 8, 0.5), 0);
  assert.equal(liftAt(w, 0.5, GROUND + 2, 0.5), 1);
});

test('breaking the vent turns the column off', () => {
  const w = makeStore(ventWorld);
  assert.equal(w.ventsNear(0, 0, 8).length, 1);
  w.setBlock(0, GROUND, 0, B.STONE);
  assert.equal(liftAt(w, 0.5, GROUND + 5, 0.5), 0);
  assert.equal(w.ventsNear(0, 0, 8).length, 0);
  w.setBlock(3, GROUND + 1, 4, B.WIND_VENT);
  assert.deepEqual(w.ventsNear(0, 0, 8), [{ x: 3, y: GROUND + 1, z: 4 }]);
});

test('a player stepping on a vent rides up and hovers near the top of the column', () => {
  const w = makeStore(ventWorld);
  const p = new Player(w);
  p.x = 0.5; p.y = GROUND + 1; p.z = 0.5;
  let peak = 0;
  run(p, keys(), 15, (pl) => { peak = Math.max(peak, pl.y); });
  const top = GROUND + 1 + VENT_REACH;
  assert.ok(peak > top - 6 && peak < top + 1, `peak ${peak.toFixed(1)}`);
  assert.ok(p.y > top - 8, `still hovering, y = ${p.y.toFixed(1)}`);
  assert.ok(p.windborne);
  assert.equal(p.health, 20);
});

test('after leaving the column the player glides down without fall damage', () => {
  const w = makeStore(ventWorld);
  const p = new Player(w);
  p.x = 0.5; p.y = GROUND + 1; p.z = 0.5;
  run(p, keys(), 12);
  // walk out sideways (yaw 0: D moves toward +x), then let go
  run(p, keys('KeyD'), 3, (pl) => pl.x < 2.5);
  let fastest = 0;
  run(p, keys(), 40, (pl) => {
    fastest = Math.min(fastest, pl.vy);
    return !pl.onGround;
  });
  assert.ok(p.onGround, `landed at y = ${p.y.toFixed(1)}`);
  assert.equal(Math.floor(p.y), GROUND + 1);
  assert.ok(fastest >= -GLIDE_FALL - 1e-9, `fell at ${fastest.toFixed(2)} blocks/s`);
  assert.equal(p.health, 20);
  assert.equal(p.windborne, false);
});

test('the same drop without a vent hurts', () => {
  const w = makeStore(ventWorld);
  const p = new Player(w);
  p.x = 8.5; p.y = GROUND + 30; p.z = 8.5;
  run(p, keys(), 10, (pl) => !pl.onGround);
  assert.ok(p.health < 20, `health ${p.health}`);
});

test('holding sneak sinks back down the column', () => {
  const w = makeStore(ventWorld);
  const p = new Player(w);
  p.x = 0.5; p.y = GROUND + 1; p.z = 0.5;
  run(p, keys(), 5);
  const high = p.y;
  run(p, keys('ShiftLeft'), 3);
  assert.ok(p.y < high - 3, `from ${high.toFixed(1)} to ${p.y.toFixed(1)}`);
});
