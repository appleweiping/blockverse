import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../src/blocks/blocks.js';
import { makeStore } from './helpers.js';

const GROUND = 100; // solid stone below this height, open sky above

// Stone up to GROUND with a sealed 9x4x9 room carved out around (0, 20, 0).
function roomWorld(wx, wy, wz) {
  if (wy === 0) return B.BEDROCK;
  if (wy >= GROUND) return B.AIR;
  if (Math.abs(wx) <= 4 && Math.abs(wz) <= 4 && wy >= 20 && wy < 24) return B.AIR;
  return B.STONE;
}

test('open sky is full brightness down to the ground and dark inside rock', () => {
  const w = makeStore(roomWorld);
  assert.equal(w.getSkyW(5, GROUND, 5), 15);
  assert.equal(w.getSkyW(5, 120, -9), 15);
  assert.equal(w.getSkyW(5, GROUND - 1, 5), 0);
  // the sealed room never sees the sky
  assert.equal(w.getSkyW(0, 21, 0), 0);
});

test('a torch lights a sealed room with one level of falloff per block', () => {
  const w = makeStore(roomWorld);
  w.setBlock(0, 20, 0, B.TORCH);
  assert.equal(w.getBlockLightW(0, 20, 0), 14);
  assert.equal(w.getBlockLightW(1, 20, 0), 13);
  assert.equal(w.getBlockLightW(3, 21, -2), 14 - 6);
  assert.equal(w.getBlockLightW(4, 23, 4), 14 - 11);
  // walls are opaque and stay dark
  assert.equal(w.getBlockLightW(5, 20, 0), 0);
});

test('removing the torch puts the room back in the dark', () => {
  const w = makeStore(roomWorld);
  w.setBlock(0, 20, 0, B.TORCH);
  w.setBlock(0, 20, 0, B.AIR);
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      for (let y = 20; y < 24; y++) assert.equal(w.getBlockLightW(x, y, z), 0, `${x},${y},${z}`);
    }
  }
});

test('two torches: removing one keeps the light from the other', () => {
  const w = makeStore(roomWorld);
  w.setBlock(-4, 20, 0, B.TORCH);
  w.setBlock(4, 20, 0, B.TORCH);
  assert.equal(w.getBlockLightW(0, 20, 0), 10);
  w.setBlock(-4, 20, 0, B.AIR);
  assert.equal(w.getBlockLightW(-4, 20, 0), 6);
  assert.equal(w.getBlockLightW(4, 20, 0), 14);
});

test('light crosses chunk borders in both directions', () => {
  const w = makeStore(roomWorld);
  // the room spans x = -4..4, so it straddles the chunk border at x = 0/-1
  w.setBlock(3, 21, 0, B.TORCH);
  assert.equal(w.getBlockLightW(-1, 21, 0), 10);
  assert.equal(w.getBlockLightW(-4, 21, 0), 7);
  // dirty-mesh bookkeeping includes the neighbouring chunk
  assert.ok(w.dirtyMeshes.has('-1,0'));
});

test('digging a shaft lets skylight fall straight down, and capping it takes it away', () => {
  const w = makeStore(roomWorld);
  for (let y = GROUND - 1; y >= 24; y--) w.setBlock(0, y, 0, B.AIR);
  // full-strength skylight falls the whole way down the shaft into the room
  assert.equal(w.getSkyW(0, 30, 0), 15);
  assert.equal(w.getSkyW(0, 23, 0), 15);
  assert.equal(w.getSkyW(0, 20, 0), 15);
  assert.equal(w.getSkyW(2, 20, 0), 13);
  // cap the shaft at the top
  w.setBlock(0, GROUND - 1, 0, B.STONE);
  assert.equal(w.getSkyW(0, 30, 0), 0);
  assert.equal(w.getSkyW(0, 20, 0), 0);
});

test('leaves and water dim skylight instead of blocking it', () => {
  const w = makeStore(roomWorld);
  w.setBlock(7, GROUND + 3, 7, B.OAK_LEAVES);
  w.setBlock(7, GROUND + 2, 7, B.WATER);
  // open air on all sides: the water cell is fed sideways, 15 - 2
  assert.equal(w.getSkyW(7, GROUND + 3, 7), 14);
  assert.equal(w.getSkyW(7, GROUND + 2, 7), 13);
  // wall the column in below the leaves so light can only come from above:
  // 14 in the leaves, 12 in the water, then -1 per block of air
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let y = GROUND; y < GROUND + 3; y++) w.setBlock(7 + dx, y, 7 + dz, B.STONE);
  }
  assert.equal(w.getSkyW(7, GROUND + 3, 7), 14);
  assert.equal(w.getSkyW(7, GROUND + 2, 7), 12);
  assert.equal(w.getSkyW(7, GROUND + 1, 7), 11);
  assert.equal(w.getSkyW(7, GROUND, 7), 10);
});
