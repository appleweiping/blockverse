import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldGen, ISLE_CLEARANCE } from '../src/world/worldgen.js';
import { B } from '../src/blocks/blocks.js';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, blockIndex } from '../src/core/constants.js';

// Seed 12345 has a cluster of sky islands and vents around chunks (0..5, 4..9).
const SEED = 12345;
const gen = new WorldGen(SEED);
const chunks = [];
for (let cx = 0; cx < 6; cx++) {
  for (let cz = 4; cz < 10; cz++) chunks.push({ cx, cz, ...gen.generateChunk(cx, cz) });
}

test('sky islands float with a gap of open air above the terrain', () => {
  let columns = 0;
  for (const { cx, cz, blocks, heightMap } of chunks) {
    for (let x = 0; x < CHUNK_X; x++) {
      for (let z = 0; z < CHUNK_Z; z++) {
        const isle = gen.islandAt(cx * 16 + x, cz * 16 + z);
        if (!isle) continue;
        columns++;
        const h = heightMap[x * CHUNK_Z + z];
        assert.ok(isle.bottom - h >= ISLE_CLEARANCE, `gap ${isle.bottom - h}`);
        assert.ok(isle.top > 85 && isle.top < CHUNK_Y - 12, `top ${isle.top}`);
        assert.equal(blocks[blockIndex(x, isle.top, z)], B.GRASS);
        const under = blocks[blockIndex(x, isle.bottom, z)];
        assert.ok(under === B.SKYSTONE || under === B.DIRT, `bottom block ${under}`);
        // the block right under the island is open air (or a tall tree's tip)
        const gap = blocks[blockIndex(x, isle.bottom - 1, z)];
        assert.ok(gap === B.AIR || gap === B.OAK_LEAVES || gap === B.SPRUCE_LEAVES, `gap block ${gap}`);
      }
    }
  }
  assert.ok(columns > 200, `only ${columns} island columns in the sample`);
});

test('natural wind vents sit beside an island with an open column above', () => {
  let vents = 0;
  for (const { cx, cz, blocks } of chunks) {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] !== B.WIND_VENT) continue;
      vents++;
      const y = i % CHUNK_Y;
      const xz = (i - y) / CHUNK_Y;
      const wx = cx * 16 + Math.floor(xz / CHUNK_Z), wz = cz * 16 + (xz % CHUNK_Z);
      assert.equal(gen.islandAt(wx, wz), null, 'no island directly above the vent');
      assert.ok(gen.islandWithin(wx, wz, 8), `vent at ${wx},${wz} has no island nearby`);
      for (let yy = y + 1; yy < CHUNK_Y; yy++) assert.equal(blocks[i - y + yy], B.AIR, `blocked at y ${yy}`);
    }
  }
  assert.ok(vents >= 3, `only ${vents} vents in the sample`);
});

test('an island crossing a chunk border is cut cleanly in both chunks', () => {
  // x = 31 | 32 is the border between chunks 1 and 2; (31, 85) is on an island
  const left = chunks.find((c) => c.cx === 1 && c.cz === 5).blocks;
  const right = chunks.find((c) => c.cx === 2 && c.cz === 5).blocks;
  for (const [x, blocks, lx] of [[31, left, 15], [32, right, 0]]) {
    const isle = gen.islandAt(x, 85);
    assert.ok(isle, `island at ${x},85`);
    for (let y = isle.bottom; y <= isle.top; y++) assert.notEqual(blocks[blockIndex(lx, y, 85 - 80)], B.AIR);
  }
});
