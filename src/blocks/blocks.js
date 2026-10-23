// Block registry. IDs are part of the save format — never renumber, only append.

import { I } from '../items/itemIds.js';

export const B = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  SANDSTONE: 7,
  GRAVEL: 8,
  CLAY: 9,
  WATER: 10,
  ICE: 11,
  SNOW_BLOCK: 12,
  SNOWY_GRASS: 13,
  OAK_LOG: 14,
  OAK_LEAVES: 15,
  OAK_PLANKS: 16,
  BIRCH_LOG: 17,
  BIRCH_LEAVES: 18,
  BIRCH_PLANKS: 19,
  SPRUCE_LOG: 20,
  SPRUCE_LEAVES: 21,
  SPRUCE_PLANKS: 22,
  CACTUS: 23,
  TALL_GRASS: 24,
  DANDELION: 25,
  POPPY: 26,
  SUGAR_CANE: 27,
  DEAD_BUSH: 28,
  COAL_ORE: 29,
  IRON_ORE: 30,
  GOLD_ORE: 31,
  DIAMOND_ORE: 32,
  EMBER_ORE: 33,
  GLASS: 34,
  EMBER_LAMP: 35,
  TORCH: 36,
  WORKBENCH: 37,
  FURNACE: 38,
  FURNACE_LIT: 39,
  BRICKS: 40,
  STONE_BRICKS: 41,
  MOSSY_COBBLE: 42,
  OBSIDIAN: 43,
  WOOL: 44,
  PUMPKIN: 45,
  MUSHROOM_BROWN: 46,
  MUSHROOM_RED: 47,
  SKYSTONE: 48,
  WIND_VENT: 49,
};

// Tool classes
export const TOOL_NONE = null;
export const TOOL_PICKAXE = 'pickaxe';
export const TOOL_AXE = 'axe';
export const TOOL_SHOVEL = 'shovel';

// Render kinds
export const R_NONE = 0;   // air
export const R_SOLID = 1;  // full opaque cube
export const R_CUTOUT = 2; // full cube, alpha-tested texture (glass, leaves)
export const R_BLEND = 3;  // alpha-blended (water, ice)
export const R_CROSS = 4;  // two crossed quads (plants)
export const R_TORCH = 5;  // small torch model

function def(id, name, display, opts = {}) {
  return {
    id,
    name,
    display,
    solid: opts.solid ?? true,               // has collision box
    render: opts.render ?? R_SOLID,
    opacity: opts.opacity ?? 15,             // light attenuation 0..15
    lightEmit: opts.lightEmit ?? 0,
    hardness: opts.hardness ?? 1,            // base break time in seconds; -1 unbreakable
    tool: opts.tool ?? TOOL_NONE,            // effective tool class
    minTier: opts.minTier ?? 0,              // tier needed to get drops (0 = hand)
    // drop: undefined => drops itself; null => nothing; number => that id;
    // function(rng) => array of {id, count}
    drop: opts.drop,
    textures: opts.textures ?? name,         // tile name or {top,bottom,side,front}
    replaceable: opts.replaceable ?? false,  // placement can overwrite it
    fluid: opts.fluid ?? false,
    climbable: false,
    sound: opts.sound ?? 'stone',            // sfx family: stone|dirt|wood|sand|leaf|glass|cloth
  };
}

export const BLOCKS = [];
function reg(block) { BLOCKS[block.id] = block; }

reg(def(B.AIR, 'air', 'Air', { solid: false, render: R_NONE, opacity: 0, hardness: -1, replaceable: true, drop: null }));
reg(def(B.STONE, 'stone', 'Stone', { hardness: 1.5, tool: TOOL_PICKAXE, minTier: 1, drop: B.COBBLESTONE }));
reg(def(B.GRASS, 'grass', 'Grass Block', {
  hardness: 0.6, tool: TOOL_SHOVEL, drop: B.DIRT, sound: 'dirt',
  textures: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
}));
reg(def(B.DIRT, 'dirt', 'Dirt', { hardness: 0.5, tool: TOOL_SHOVEL, sound: 'dirt' }));
reg(def(B.COBBLESTONE, 'cobblestone', 'Cobblestone', { hardness: 2, tool: TOOL_PICKAXE, minTier: 1 }));
reg(def(B.BEDROCK, 'bedrock', 'Bedrock', { hardness: -1, drop: null }));
reg(def(B.SAND, 'sand', 'Sand', { hardness: 0.5, tool: TOOL_SHOVEL, sound: 'sand' }));
reg(def(B.SANDSTONE, 'sandstone', 'Sandstone', {
  hardness: 0.8, tool: TOOL_PICKAXE, minTier: 1,
  textures: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' },
}));
reg(def(B.GRAVEL, 'gravel', 'Gravel', { hardness: 0.6, tool: TOOL_SHOVEL, sound: 'sand' }));
reg(def(B.CLAY, 'clay', 'Clay', {
  hardness: 0.6, tool: TOOL_SHOVEL, sound: 'dirt',
  drop: () => [{ id: I.CLAY_BALL, count: 4 }],
}));
reg(def(B.WATER, 'water', 'Water', {
  solid: false, render: R_BLEND, opacity: 2, hardness: -1, replaceable: true,
  drop: null, fluid: true,
}));
reg(def(B.ICE, 'ice', 'Ice', { render: R_BLEND, opacity: 2, hardness: 0.5, tool: TOOL_PICKAXE, drop: null, sound: 'glass' }));
reg(def(B.SNOW_BLOCK, 'snow_block', 'Snow Block', { hardness: 0.2, tool: TOOL_SHOVEL, sound: 'cloth' }));
reg(def(B.SNOWY_GRASS, 'snowy_grass', 'Snowy Grass', {
  hardness: 0.6, tool: TOOL_SHOVEL, drop: B.DIRT, sound: 'dirt',
  textures: { top: 'snow_block', bottom: 'dirt', side: 'snowy_grass_side' },
}));
reg(def(B.OAK_LOG, 'oak_log', 'Oak Log', {
  hardness: 2, tool: TOOL_AXE, sound: 'wood',
  textures: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' },
}));
reg(def(B.OAK_LEAVES, 'oak_leaves', 'Oak Leaves', {
  render: R_CUTOUT, opacity: 1, hardness: 0.2, sound: 'leaf',
  drop: (rng) => {
    const drops = [];
    if (rng() < 0.05) drops.push({ id: I.APPLE, count: 1 });
    if (rng() < 0.1) drops.push({ id: I.STICK, count: 1 });
    return drops;
  },
}));
reg(def(B.OAK_PLANKS, 'oak_planks', 'Oak Planks', { hardness: 2, tool: TOOL_AXE, sound: 'wood' }));
reg(def(B.BIRCH_LOG, 'birch_log', 'Birch Log', {
  hardness: 2, tool: TOOL_AXE, sound: 'wood',
  textures: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' },
}));
reg(def(B.BIRCH_LEAVES, 'birch_leaves', 'Birch Leaves', { render: R_CUTOUT, opacity: 1, hardness: 0.2, sound: 'leaf', drop: null }));
reg(def(B.BIRCH_PLANKS, 'birch_planks', 'Birch Planks', { hardness: 2, tool: TOOL_AXE, sound: 'wood' }));
reg(def(B.SPRUCE_LOG, 'spruce_log', 'Spruce Log', {
  hardness: 2, tool: TOOL_AXE, sound: 'wood',
  textures: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' },
}));
reg(def(B.SPRUCE_LEAVES, 'spruce_leaves', 'Spruce Leaves', { render: R_CUTOUT, opacity: 1, hardness: 0.2, sound: 'leaf', drop: null }));
reg(def(B.SPRUCE_PLANKS, 'spruce_planks', 'Spruce Planks', { hardness: 2, tool: TOOL_AXE, sound: 'wood' }));
reg(def(B.CACTUS, 'cactus', 'Cactus', {
  hardness: 0.4, sound: 'cloth',
  textures: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus' },
}));
reg(def(B.TALL_GRASS, 'tall_grass', 'Tall Grass', {
  solid: false, render: R_CROSS, opacity: 0, hardness: 0.05, replaceable: true, sound: 'leaf', drop: null,
}));
reg(def(B.DANDELION, 'dandelion', 'Dandelion', { solid: false, render: R_CROSS, opacity: 0, hardness: 0.05, sound: 'leaf' }));
reg(def(B.POPPY, 'poppy', 'Poppy', { solid: false, render: R_CROSS, opacity: 0, hardness: 0.05, sound: 'leaf' }));
reg(def(B.SUGAR_CANE, 'sugar_cane', 'Sugar Cane', { solid: false, render: R_CROSS, opacity: 0, hardness: 0.1, sound: 'leaf' }));
reg(def(B.DEAD_BUSH, 'dead_bush', 'Dead Bush', { solid: false, render: R_CROSS, opacity: 0, hardness: 0.05, sound: 'leaf', drop: null }));
reg(def(B.COAL_ORE, 'coal_ore', 'Coal Ore', {
  hardness: 3, tool: TOOL_PICKAXE, minTier: 1, drop: () => [{ id: I.COAL, count: 1 }],
}));
reg(def(B.IRON_ORE, 'iron_ore', 'Iron Ore', { hardness: 3, tool: TOOL_PICKAXE, minTier: 2 }));
reg(def(B.GOLD_ORE, 'gold_ore', 'Gold Ore', { hardness: 3, tool: TOOL_PICKAXE, minTier: 3 }));
reg(def(B.DIAMOND_ORE, 'diamond_ore', 'Diamond Ore', {
  hardness: 3, tool: TOOL_PICKAXE, minTier: 3, drop: () => [{ id: I.DIAMOND, count: 1 }],
}));
reg(def(B.EMBER_ORE, 'ember_ore', 'Ember Ore', {
  hardness: 3, tool: TOOL_PICKAXE, minTier: 3,
  drop: (rng) => [{ id: I.EMBER_DUST, count: 1 + ((rng() * 3) | 0) }],
}));
reg(def(B.GLASS, 'glass', 'Glass', { render: R_CUTOUT, opacity: 0, hardness: 0.3, drop: null, sound: 'glass' }));
reg(def(B.EMBER_LAMP, 'ember_lamp', 'Ember Lamp', { lightEmit: 15, hardness: 0.3, sound: 'glass' }));
reg(def(B.TORCH, 'torch', 'Torch', {
  solid: false, render: R_TORCH, opacity: 0, lightEmit: 14, hardness: 0.05, sound: 'wood',
}));
reg(def(B.WORKBENCH, 'workbench', 'Workbench', {
  hardness: 2.5, tool: TOOL_AXE, sound: 'wood',
  textures: { top: 'workbench_top', bottom: 'oak_planks', side: 'workbench_side', front: 'workbench_front' },
}));
reg(def(B.FURNACE, 'furnace', 'Furnace', {
  hardness: 3.5, tool: TOOL_PICKAXE, minTier: 1,
  textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' },
}));
reg(def(B.FURNACE_LIT, 'furnace_lit', 'Furnace', {
  hardness: 3.5, tool: TOOL_PICKAXE, minTier: 1, lightEmit: 13, drop: B.FURNACE,
  textures: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' },
}));
reg(def(B.BRICKS, 'bricks', 'Bricks', { hardness: 2, tool: TOOL_PICKAXE, minTier: 1 }));
reg(def(B.STONE_BRICKS, 'stone_bricks', 'Stone Bricks', { hardness: 1.5, tool: TOOL_PICKAXE, minTier: 1 }));
reg(def(B.MOSSY_COBBLE, 'mossy_cobble', 'Mossy Cobblestone', { hardness: 2, tool: TOOL_PICKAXE, minTier: 1 }));
reg(def(B.OBSIDIAN, 'obsidian', 'Obsidian', { hardness: 30, tool: TOOL_PICKAXE, minTier: 4 }));
reg(def(B.WOOL, 'wool', 'Wool', { hardness: 0.8, sound: 'cloth' }));
reg(def(B.PUMPKIN, 'pumpkin', 'Pumpkin', {
  hardness: 1, tool: TOOL_AXE, sound: 'wood',
  textures: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' },
}));
reg(def(B.MUSHROOM_BROWN, 'mushroom_brown', 'Brown Mushroom', { solid: false, render: R_CROSS, opacity: 0, hardness: 0.05, sound: 'leaf' }));
reg(def(B.MUSHROOM_RED, 'mushroom_red', 'Red Mushroom', { solid: false, render: R_CROSS, opacity: 0, hardness: 0.05, sound: 'leaf' }));
// Sky islands are made of skystone; wind vents push things straight up
// (see world/wind.js).
reg(def(B.SKYSTONE, 'skystone', 'Skystone', { hardness: 1.2, tool: TOOL_PICKAXE, minTier: 1, lightEmit: 7 }));
reg(def(B.WIND_VENT, 'wind_vent', 'Wind Vent', {
  hardness: 2, tool: TOOL_PICKAXE, minTier: 1,
  textures: { top: 'wind_vent_top', bottom: 'skystone', side: 'wind_vent_side' },
}));

export function blockInfo(id) {
  return BLOCKS[id] ?? BLOCKS[B.AIR];
}

// Is this block a full opaque cube (for face culling + light blocking)?
export function isOpaque(id) {
  const b = BLOCKS[id];
  return b ? b.opacity >= 15 : false;
}

export function isSolid(id) {
  const b = BLOCKS[id];
  return b ? b.solid : false;
}

// Blocks a face of `id` adjacent to `neighborId` need to be drawn?
export function faceVisible(id, neighborId) {
  const nb = BLOCKS[neighborId];
  if (!nb || nb.render === R_NONE) return true;
  if (nb.render === R_SOLID) return false;
  // Same transparent block type: hide inner faces (water-water, glass-glass, leaves keep faces for depth)
  if (id === neighborId) {
    const b = BLOCKS[id];
    return b.render === R_CUTOUT && (id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES);
  }
  return true;
}
