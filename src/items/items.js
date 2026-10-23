// Item registry. IDs < 256 are placeable blocks (see blocks.js);
// IDs >= 256 are pure items defined here.

import { B, BLOCKS, blockInfo } from '../blocks/blocks.js';
import { I } from './itemIds.js';

export { I };

export const TIER_WOOD = 1;
export const TIER_STONE = 2;
export const TIER_IRON = 3;
export const TIER_GOLD = 1;    // gold: fast but weak tier
export const TIER_DIAMOND = 4;

const TIER_STATS = {
  wood: { tier: 1, speed: 2, durability: 60, damage: 4 },
  stone: { tier: 2, speed: 4, durability: 132, damage: 5 },
  iron: { tier: 3, speed: 6, durability: 251, damage: 6 },
  gold: { tier: 1, speed: 12, durability: 33, damage: 4 },
  diamond: { tier: 4, speed: 8, durability: 1562, damage: 7 },
};

const ITEMS = new Map();

function item(id, name, display, opts = {}) {
  ITEMS.set(id, {
    id,
    name,
    display,
    texture: opts.texture ?? name,
    stack: opts.stack ?? 64,
    tool: opts.tool ?? null,   // {class, tier, speed, durability, damage}
    food: opts.food ?? 0,      // hunger points restored
    burnTime: opts.burnTime ?? 0, // furnace fuel, in seconds
  });
}

function toolItem(id, material, cls) {
  const s = TIER_STATS[material];
  const display = `${material[0].toUpperCase()}${material.slice(1)} ${cls[0].toUpperCase()}${cls.slice(1)}`;
  item(id, `${material}_${cls}`, display, {
    stack: 1,
    burnTime: material === 'wood' ? 10 : 0,
    tool: {
      class: cls,
      tier: s.tier,
      speed: s.speed,
      durability: s.durability,
      damage: cls === 'sword' ? s.damage : Math.max(1, s.damage - 3),
    },
  });
}

item(I.STICK, 'stick', 'Stick', { burnTime: 5 });
item(I.COAL, 'coal', 'Coal', { burnTime: 80 });
item(I.IRON_INGOT, 'iron_ingot', 'Iron Ingot');
item(I.GOLD_INGOT, 'gold_ingot', 'Gold Ingot');
item(I.DIAMOND, 'diamond', 'Diamond');
item(I.EMBER_DUST, 'ember_dust', 'Ember Dust');
item(I.PORK_RAW, 'raw_pork', 'Raw Pork', { food: 3 });
item(I.PORK_ROAST, 'roast_pork', 'Roast Pork', { food: 8 });
item(I.APPLE, 'apple', 'Apple', { food: 4 });
item(I.MURK_JELLY, 'murk_jelly', 'Murk Jelly', { food: 2 });
item(I.MUTTON_RAW, 'raw_mutton', 'Raw Mutton', { food: 2 });
item(I.MUTTON_ROAST, 'roast_mutton', 'Roast Mutton', { food: 6 });
item(I.BRICK_ITEM, 'brick_item', 'Brick');
item(I.CLAY_BALL, 'clay_ball', 'Clay Ball');

for (const [mat, ids] of [
  ['wood', [I.WOOD_PICKAXE, I.WOOD_AXE, I.WOOD_SHOVEL, I.WOOD_SWORD]],
  ['stone', [I.STONE_PICKAXE, I.STONE_AXE, I.STONE_SHOVEL, I.STONE_SWORD]],
  ['iron', [I.IRON_PICKAXE, I.IRON_AXE, I.IRON_SHOVEL, I.IRON_SWORD]],
  ['gold', [I.GOLD_PICKAXE, I.GOLD_AXE, I.GOLD_SHOVEL, I.GOLD_SWORD]],
  ['diamond', [I.DIAMOND_PICKAXE, I.DIAMOND_AXE, I.DIAMOND_SHOVEL, I.DIAMOND_SWORD]],
]) {
  const [pick, axe, shovel, sword] = ids;
  toolItem(pick, mat, 'pickaxe');
  toolItem(axe, mat, 'axe');
  toolItem(shovel, mat, 'shovel');
  toolItem(sword, mat, 'sword');
}

// Burn times for block fuels
const BLOCK_BURN = new Map([
  [B.OAK_PLANKS, 15], [B.BIRCH_PLANKS, 15], [B.SPRUCE_PLANKS, 15],
  [B.OAK_LOG, 15], [B.BIRCH_LOG, 15], [B.SPRUCE_LOG, 15],
  [B.WORKBENCH, 15], [B.COAL_ORE, 0], [B.DEAD_BUSH, 5],
]);

// Unified item info for any id (block or item).
export function itemInfo(id) {
  if (id < 256) {
    const b = blockInfo(id);
    return {
      id,
      name: b.name,
      display: b.display,
      texture: null,        // block items render from their block textures
      block: b,
      stack: 64,
      tool: null,
      food: 0,
      burnTime: BLOCK_BURN.get(id) ?? 0,
    };
  }
  return ITEMS.get(id) ?? null;
}

export function isBlockItem(id) {
  return id > 0 && id < 256 && !!BLOCKS[id];
}

export function maxStack(id) {
  const info = itemInfo(id);
  return info ? info.stack : 64;
}

// ---- Inventory stack helpers ----
// A stack is {id, count, dur?} or null.

export function makeStack(id, count = 1) {
  const info = itemInfo(id);
  const s = { id, count };
  if (info?.tool) s.dur = info.tool.durability;
  return s;
}

export function stacksEqual(a, b) {
  return a && b && a.id === b.id && (a.dur === undefined) === (b.dur === undefined);
}

// Try to merge stack b into a (mutates a). Returns leftover count.
export function mergeStack(a, b) {
  if (!stacksEqual(a, b) || a.dur !== undefined) return b.count;
  const room = maxStack(a.id) - a.count;
  const moved = Math.min(room, b.count);
  a.count += moved;
  return b.count - moved;
}
