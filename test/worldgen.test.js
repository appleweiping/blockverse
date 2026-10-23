import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldGen } from '../src/world/worldgen.js';
import { B } from '../src/blocks/blocks.js';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, SEA_LEVEL, blockIndex } from '../src/core/constants.js';

// Seed 10 has a forest along chunks (0..5, 0): 22 trees.
const FOREST_SEED = 10;

test('the same seed generates the same chunk', () => {
  const a = new WorldGen(2024).generateChunk(3, -7);
  const b = new WorldGen(2024).generateChunk(3, -7);
  assert.deepEqual(a.blocks, b.blocks);
  assert.deepEqual(a.heightMap, b.heightMap);
  assert.deepEqual(a.biomeMap, b.biomeMap);
  const c = new WorldGen(2025).generateChunk(3, -7);
  assert.notDeepEqual(a.blocks, c.blocks);
});

test('every column has bedrock at y=0 and water or land up to sea level', () => {
  const { blocks, heightMap } = new WorldGen(5).generateChunk(0, 0);
  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      assert.equal(blocks[blockIndex(x, 0, z)], B.BEDROCK);
      const h = heightMap[x * CHUNK_Z + z];
      assert.ok(h >= 4 && h < CHUNK_Y - 9, `height ${h}`);
      // nothing floats above the column top except plants/trees, which are
      // never placed above y = h + 12 (sky islands are tested separately)
      for (let y = h + 13; y < CHUNK_Y; y++) {
        const id = blocks[blockIndex(x, y, z)];
        assert.ok(id === B.AIR || y > 80, `y ${y}: ${id}`);
      }
      if (h < SEA_LEVEL) {
        const top = blocks[blockIndex(x, SEA_LEVEL, z)];
        assert.ok(top === B.WATER || top === B.ICE, `expected water at sea level, got ${top}`);
      }
    }
  }
});

test('a tree on a chunk border is written into both chunks', () => {
  const gen = new WorldGen(1);
  const tree = { type: 'tree', kind: 'oak', wx: 15, wy: 60, wz: 8, size: 5 };
  const left = new Uint16Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
  const right = new Uint16Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
  gen.applyFeature(left, 0, 0, { ...tree, rng: null });
  gen.applyFeature(right, 1, 0, { ...tree, rng: null });
  // trunk only in the left chunk
  assert.equal(left[blockIndex(15, 60, 8)], B.OAK_LOG);
  // canopy reaches two blocks into the right chunk (x = 16, 17)
  assert.equal(right[blockIndex(0, 63, 8)], B.OAK_LEAVES);
  assert.equal(right[blockIndex(1, 63, 8)], B.OAK_LEAVES);
  // and nothing was written out of bounds on the other side
  assert.equal(right[blockIndex(15, 63, 8)], B.AIR);
});

test('neighbouring chunks agree on features that cross their border', () => {
  // Generate a strip of chunks and check that every log column has leaves
  // above it, i.e. no tree got cut in half by a chunk seam.
  const LOGS = new Set([B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG]);
  const LEAVES = new Set([B.OAK_LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
  const gen = new WorldGen(FOREST_SEED);
  const strip = [];
  for (let cx = 0; cx < 6; cx++) strip.push(gen.generateChunk(cx, 0).blocks);
  const at = (wx, y, wz) => strip[wx >> 4][blockIndex(wx & 15, y, wz)];
  let trees = 0;
  for (let wx = 0; wx < 6 * 16; wx++) {
    for (let wz = 0; wz < 16; wz++) {
      for (let y = 1; y < CHUNK_Y - 2; y++) {
        if (!LOGS.has(at(wx, y, wz)) || LOGS.has(at(wx, y + 1, wz))) continue;
        trees++;
        // top of a trunk: there is always foliage right above it
        assert.ok(LEAVES.has(at(wx, y + 1, wz)) || LEAVES.has(at(wx, y + 2, wz)),
          `bare trunk top at ${wx},${y},${wz}`);
      }
    }
  }
  assert.ok(trees > 10, `expected a forest, found ${trees} trunks`);
});
