// Crafting recipes (shaped + shapeless) and furnace smelting data.

import { B } from '../blocks/blocks.js';
import { I } from './itemIds.js';

const ANY_PLANKS = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const ANY_LOG = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG];

// Shaped: pattern rows with keys; '.' = empty. Matched anywhere in the grid,
// plus horizontally mirrored variants.
// Shapeless: exact multiset of ingredients.
export const RECIPES = [];

function shaped(result, count, pattern, keys) {
  RECIPES.push({ type: 'shaped', result, count, pattern, keys });
}

function shapeless(result, count, ingredients) {
  RECIPES.push({ type: 'shapeless', result, count, ingredients });
}

// wood processing (species preserved)
shapeless(B.OAK_PLANKS, 4, [[B.OAK_LOG]]);
shapeless(B.BIRCH_PLANKS, 4, [[B.BIRCH_LOG]]);
shapeless(B.SPRUCE_PLANKS, 4, [[B.SPRUCE_LOG]]);
shaped(I.STICK, 4, ['X', 'X'], { X: ANY_PLANKS });
shaped(B.WORKBENCH, 1, ['XX', 'XX'], { X: ANY_PLANKS });
shaped(B.FURNACE, 1, ['XXX', 'X.X', 'XXX'], { X: [B.COBBLESTONE] });
shaped(B.TORCH, 4, ['C', 'S'], { C: [I.COAL], S: [I.STICK] });

// tools: [material group, pickaxe head, axe, shovel, sword]
const TOOL_MATS = [
  [ANY_PLANKS, I.WOOD_PICKAXE, I.WOOD_AXE, I.WOOD_SHOVEL, I.WOOD_SWORD],
  [[B.COBBLESTONE], I.STONE_PICKAXE, I.STONE_AXE, I.STONE_SHOVEL, I.STONE_SWORD],
  [[I.IRON_INGOT], I.IRON_PICKAXE, I.IRON_AXE, I.IRON_SHOVEL, I.IRON_SWORD],
  [[I.GOLD_INGOT], I.GOLD_PICKAXE, I.GOLD_AXE, I.GOLD_SHOVEL, I.GOLD_SWORD],
  [[I.DIAMOND], I.DIAMOND_PICKAXE, I.DIAMOND_AXE, I.DIAMOND_SHOVEL, I.DIAMOND_SWORD],
];
for (const [mat, pick, axe, shovel, sword] of TOOL_MATS) {
  const keys = { X: mat, S: [I.STICK] };
  shaped(pick, 1, ['XXX', '.S.', '.S.'], keys);
  shaped(axe, 1, ['XX', 'XS', '.S'], keys);
  shaped(shovel, 1, ['X', 'S', 'S'], keys);
  shaped(sword, 1, ['X', 'X', 'S'], keys);
}

// building blocks
shaped(B.STONE_BRICKS, 4, ['XX', 'XX'], { X: [B.STONE] });
shaped(B.SANDSTONE, 1, ['XX', 'XX'], { X: [B.SAND] });
shaped(B.BRICKS, 1, ['XX', 'XX'], { X: [I.BRICK_ITEM] });
shaped(B.EMBER_LAMP, 1, ['XX', 'XX'], { X: [I.EMBER_DUST] });
shapeless(B.MOSSY_COBBLE, 1, [[B.COBBLESTONE], [B.TALL_GRASS]]);

// ---- matching ----

function idMatches(cellId, group) {
  return group.includes(cellId);
}

// grid: array of item ids (0 = empty) with given width/height (2x2 or 3x3).
// Returns {id, count} or null.
export function matchRecipe(grid, w, h) {
  // bounding box of non-empty cells
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const items = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = grid[y * w + x];
      if (id) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        items.push(id);
      }
    }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  outer:
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (items.length !== r.ingredients.length) continue;
      const pool = [...r.ingredients];
      for (const id of items) {
        const idx = pool.findIndex((group) => idMatches(id, group));
        if (idx === -1) continue outer;
        pool.splice(idx, 1);
      }
      return { id: r.result, count: r.count };
    }

    const rows = r.pattern;
    const pw = rows[0].length, ph = rows.length;
    if (pw !== bw || ph !== bh) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < ph && ok; y++) {
        for (let x = 0; x < pw && ok; x++) {
          const ch = rows[y][mirror ? pw - 1 - x : x];
          const cell = grid[(minY + y) * w + (minX + x)];
          if (ch === '.') {
            if (cell) ok = false;
          } else {
            const group = r.keys[ch];
            if (!cell || !group || !idMatches(cell, group)) ok = false;
          }
        }
      }
      if (ok) return { id: r.result, count: r.count };
    }
  }
  return null;
}

// ---- smelting ----

export const SMELTING = new Map([
  [B.IRON_ORE, { id: I.IRON_INGOT, count: 1 }],
  [B.GOLD_ORE, { id: I.GOLD_INGOT, count: 1 }],
  [B.SAND, { id: B.GLASS, count: 1 }],
  [B.COBBLESTONE, { id: B.STONE, count: 1 }],
  [I.CLAY_BALL, { id: I.BRICK_ITEM, count: 1 }],
  [I.PORK_RAW, { id: I.PORK_ROAST, count: 1 }],
  [I.MUTTON_RAW, { id: I.MUTTON_ROAST, count: 1 }],
]);

export const SMELT_TIME = 10; // seconds per item
