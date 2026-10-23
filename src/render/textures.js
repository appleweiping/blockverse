// Procedural pixel-art texture generation. Every tile is original art drawn
// in code — nothing is copied from any existing game. Tiles are 16x16 and
// deterministic (seeded per tile name) so they look identical every run.

import { coordRng, hashString } from '../core/rng.js';

export const TILE = 16;

// ---------- low-level helpers ----------

function shade([r, g, b, a = 255], f) {
  return [Math.min(255, r * f) | 0, Math.min(255, g * f) | 0, Math.min(255, b * f) | 0, a];
}

function css([r, g, b, a = 255]) {
  return `rgba(${r | 0},${g | 0},${b | 0},${(a / 255).toFixed(3)})`;
}

function px(ctx, x, y, col) {
  if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
  ctx.fillStyle = css(col);
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx, x, y, w, h, col) {
  ctx.fillStyle = css(col);
  ctx.fillRect(x, y, w, h);
}

// Fill the tile with per-pixel noise picked from weighted colors: [[col, weight], ...]
function fillNoise(ctx, rng, colors) {
  let total = 0;
  for (const [, w] of colors) total += w;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let r = rng() * total;
      for (const [col, w] of colors) {
        r -= w;
        if (r <= 0) { px(ctx, x, y, col); break; }
      }
    }
  }
}

// Scatter n pixels of col randomly.
function speckle(ctx, rng, col, n) {
  for (let i = 0; i < n; i++) {
    px(ctx, (rng() * TILE) | 0, (rng() * TILE) | 0, col);
  }
}

// Small irregular blob centred at (cx, cy).
function blob(ctx, rng, cx, cy, size, cols) {
  for (let i = 0; i < size; i++) {
    const x = cx + ((rng() * 3) | 0) - 1;
    const y = cy + ((rng() * 3) | 0) - 1;
    px(ctx, x, y, cols[(rng() * cols.length) | 0]);
  }
}

// ---------- palettes ----------

const P = {
  stoneL: [138, 138, 138], stone: [125, 125, 125], stoneD: [105, 105, 105], stoneDD: [88, 88, 88],
  dirtL: [155, 112, 74], dirt: [134, 96, 60], dirtD: [110, 78, 48],
  grassL: [118, 190, 82], grass: [96, 168, 68], grassD: [76, 140, 54],
  sandL: [222, 210, 164], sand: [210, 196, 148], sandD: [188, 174, 128],
  snowL: [250, 251, 253], snow: [238, 242, 247], snowD: [216, 224, 236],
  woodOakL: [178, 140, 88], woodOak: [158, 122, 74], woodOakD: [132, 100, 58],
  barkOak: [104, 82, 50], barkOakD: [84, 66, 40], barkOakL: [122, 98, 62],
  birchL: [232, 230, 222], birch: [214, 212, 202], birchD: [70, 66, 60],
  spruceBark: [72, 54, 34], spruceBarkD: [56, 42, 26], spruceBarkL: [88, 68, 44],
  leafOak: [64, 130, 42], leafOakD: [48, 104, 32], leafOakL: [82, 152, 54],
  leafBirch: [96, 156, 68], leafBirchD: [76, 128, 52], leafBirchL: [116, 176, 84],
  leafSpruce: [44, 96, 60], leafSpruceD: [32, 76, 46], leafSpruceL: [58, 116, 74],
  waterL: [64, 118, 228, 205], water: [48, 100, 214, 205], waterD: [38, 84, 196, 205],
};

// ---------- tile generators ----------

const generators = {};
function tile(name, fn) { generators[name] = fn; }

// --- ground ---
tile('stone', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.stone, 8], [P.stoneL, 3], [P.stoneD, 3], [P.stoneDD, 1]]);
});

tile('cobblestone', (ctx, rng) => cobble(ctx, rng, false));
tile('mossy_cobble', (ctx, rng) => cobble(ctx, rng, true));

function cobble(ctx, rng, mossy) {
  fillNoise(ctx, rng, [[P.stoneD, 5], [P.stoneDD, 3]]);
  // rounded stone lumps on a jittered grid
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const cx = gx * 5 + 1 + ((rng() * 2) | 0);
      const cy = gy * 5 + 1 + ((rng() * 2) | 0);
      const w = 3 + ((rng() * 2) | 0);
      const h = 3 + ((rng() * 2) | 0);
      const base = rng() < 0.5 ? P.stone : P.stoneL;
      rect(ctx, cx, cy, w, h, base);
      rect(ctx, cx, cy, w, 1, shade(base, 1.12));
      rect(ctx, cx, cy + h - 1, w, 1, shade(base, 0.85));
    }
  }
  if (mossy) {
    for (let i = 0; i < 5; i++) {
      blob(ctx, rng, (rng() * 14 + 1) | 0, (rng() * 14 + 1) | 0, 8, [P.grassD, [58, 110, 44], P.grass]);
    }
  }
}

tile('bedrock', (ctx, rng) => {
  fillNoise(ctx, rng, [[[60, 60, 60], 5], [[40, 40, 40], 4], [[90, 90, 90], 3], [[25, 25, 25], 2]]);
});

tile('dirt', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.dirt, 7], [P.dirtL, 3], [P.dirtD, 3]]);
  speckle(ctx, rng, [92, 64, 40], 8);
});

tile('grass_top', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.grass, 7], [P.grassL, 3], [P.grassD, 3]]);
  speckle(ctx, rng, [130, 200, 96], 6);
});

tile('grass_side', (ctx, rng) => {
  generators['dirt'](ctx, rng);
  rect(ctx, 0, 0, TILE, 3, P.grass);
  for (let x = 0; x < TILE; x++) {
    const d = 2 + ((rng() * 3) | 0); // jagged grass lip
    for (let y = 0; y < d; y++) px(ctx, x, y, rng() < 0.4 ? P.grassL : P.grass);
    px(ctx, x, d, P.grassD);
  }
});

tile('snowy_grass_side', (ctx, rng) => {
  generators['dirt'](ctx, rng);
  for (let x = 0; x < TILE; x++) {
    const d = 2 + ((rng() * 3) | 0);
    for (let y = 0; y < d; y++) px(ctx, x, y, rng() < 0.4 ? P.snowL : P.snow);
    px(ctx, x, d, P.snowD);
  }
});

tile('snow_block', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.snow, 8], [P.snowL, 4], [P.snowD, 2]]);
});

tile('sand', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.sand, 8], [P.sandL, 3], [P.sandD, 3]]);
});

tile('sandstone', (ctx, rng) => {
  for (let y = 0; y < TILE; y++) {
    const band = Math.sin(y * 1.1) * 0.08 + 1;
    for (let x = 0; x < TILE; x++) {
      const c = rng() < 0.2 ? P.sandD : P.sand;
      px(ctx, x, y, shade(c, band));
    }
  }
  rect(ctx, 0, 0, TILE, 1, P.sandL);
  rect(ctx, 0, TILE - 1, TILE, 1, P.sandD);
});

tile('sandstone_top', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.sand, 8], [P.sandL, 4], [P.sandD, 1]]);
});

tile('gravel', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.stone, 5], [P.stoneD, 4], [[146, 132, 120], 3], [[100, 92, 84], 3]]);
  for (let i = 0; i < 7; i++) {
    blob(ctx, rng, (rng() * 14 + 1) | 0, (rng() * 14 + 1) | 0, 4, [P.stoneL, [160, 148, 136]]);
  }
});

tile('clay', (ctx, rng) => {
  fillNoise(ctx, rng, [[[158, 164, 178], 7], [[142, 148, 164], 4], [[172, 178, 190], 3]]);
});

// --- fluids / ice ---
tile('water', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.water, 7], [P.waterD, 3], [P.waterL, 2]]);
  for (let i = 0; i < 4; i++) {
    const y = (rng() * TILE) | 0;
    const x = (rng() * 10) | 0;
    rect(ctx, x, y, 4 + ((rng() * 4) | 0), 1, [110, 160, 240, 160]);
  }
});

tile('ice', (ctx, rng) => {
  fillNoise(ctx, rng, [[[158, 190, 242, 235], 7], [[140, 174, 232, 235], 4], [[184, 210, 248, 235], 3]]);
  for (let i = 0; i < 3; i++) {
    let x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    for (let s = 0; s < 5; s++) {
      px(ctx, x, y, [226, 240, 254, 240]);
      x += rng() < 0.5 ? 1 : -1; y += 1;
    }
  }
});

// --- wood ---
function barkSide(ctx, rng, base, dark, light) {
  for (let x = 0; x < TILE; x++) {
    const stripe = rng();
    for (let y = 0; y < TILE; y++) {
      let c = base;
      if (stripe < 0.28) c = dark;
      else if (stripe > 0.82) c = light;
      if (rng() < 0.12) c = shade(c, 0.88);
      px(ctx, x, y, c);
    }
  }
  // knots / cracks
  for (let i = 0; i < 3; i++) {
    const x = (rng() * TILE) | 0;
    const y = (rng() * 10) | 0;
    rect(ctx, x, y, 1, 3 + ((rng() * 4) | 0), dark);
  }
}

function logTop(ctx, rng, bark, wood, woodD) {
  rect(ctx, 0, 0, TILE, TILE, bark);
  rect(ctx, 2, 2, 12, 12, wood);
  // growth rings
  rect(ctx, 4, 4, 8, 8, woodD);
  rect(ctx, 6, 6, 4, 4, wood);
  rect(ctx, 7, 7, 2, 2, woodD);
  speckle(ctx, rng, shade(wood, 1.1), 10);
}

tile('oak_log', (ctx, rng) => barkSide(ctx, rng, P.barkOak, P.barkOakD, P.barkOakL));
tile('oak_log_top', (ctx, rng) => logTop(ctx, rng, P.barkOak, P.woodOak, P.woodOakD));
tile('birch_log', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.birch, 8], [P.birchL, 4], [[196, 194, 186], 2]]);
  for (let i = 0; i < 6; i++) {
    const y = (rng() * TILE) | 0;
    rect(ctx, (rng() * 12) | 0, y, 2 + ((rng() * 3) | 0), 1, P.birchD);
  }
});
tile('birch_log_top', (ctx, rng) => logTop(ctx, rng, P.birch, [206, 188, 152], [182, 164, 130]));
tile('spruce_log', (ctx, rng) => barkSide(ctx, rng, P.spruceBark, P.spruceBarkD, P.spruceBarkL));
tile('spruce_log_top', (ctx, rng) => logTop(ctx, rng, P.spruceBark, [140, 106, 66], [116, 88, 54]));

function planks(ctx, rng, base) {
  const dark = shade(base, 0.72);
  const light = shade(base, 1.12);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = base;
        if (rng() < 0.18) c = shade(base, 0.92);
        if (rng() < 0.08) c = light;
        px(ctx, x, y, c);
      }
    }
    rect(ctx, 0, y0 + 3, TILE, 1, dark);          // horizontal seam
    const joint = ((rng() * 12) | 0) + 2;          // one vertical joint per plank
    rect(ctx, joint, y0, 1, 3, dark);
  }
}

tile('oak_planks', (ctx, rng) => planks(ctx, rng, P.woodOak));
tile('birch_planks', (ctx, rng) => planks(ctx, rng, [206, 190, 150]));
tile('spruce_planks', (ctx, rng) => planks(ctx, rng, [112, 84, 50]));

function leaves(ctx, rng, base, dark, light) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = rng();
      if (r < 0.22) continue; // transparent hole
      let c = base;
      if (r < 0.45) c = dark;
      else if (r > 0.85) c = light;
      px(ctx, x, y, c);
    }
  }
}

tile('oak_leaves', (ctx, rng) => leaves(ctx, rng, P.leafOak, P.leafOakD, P.leafOakL));
tile('birch_leaves', (ctx, rng) => leaves(ctx, rng, P.leafBirch, P.leafBirchD, P.leafBirchL));
tile('spruce_leaves', (ctx, rng) => leaves(ctx, rng, P.leafSpruce, P.leafSpruceD, P.leafSpruceL));

// --- desert plants ---
tile('cactus', (ctx, rng) => {
  const g = [58, 128, 48], gD = [44, 102, 38], gL = [82, 150, 62];
  rect(ctx, 0, 0, TILE, TILE, g);
  for (let x = 0; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, gD); // ridges
  for (let x = 2; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, gL);
  for (let i = 0; i < 8; i++) px(ctx, (rng() * TILE) | 0, (rng() * TILE) | 0, [230, 238, 210]); // spines
});

tile('cactus_top', (ctx, rng) => {
  rect(ctx, 0, 0, TILE, TILE, [44, 102, 38]);
  rect(ctx, 1, 1, 14, 14, [58, 128, 48]);
  rect(ctx, 4, 4, 8, 8, [72, 142, 56]);
  speckle(ctx, rng, [230, 238, 210], 5);
});

// --- cross plants (transparent background) ---
tile('tall_grass', (ctx, rng) => {
  for (let i = 0; i < 9; i++) {
    let x = 2 + ((rng() * 12) | 0);
    const h = 6 + ((rng() * 9) | 0);
    const col = rng() < 0.5 ? P.grass : P.grassD;
    for (let y = TILE - 1; y > TILE - h; y--) {
      px(ctx, x, y, col);
      if (rng() < 0.3) x += rng() < 0.5 ? 1 : -1;
    }
  }
});

function flower(ctx, rng, petal, center) {
  // stem
  let x = 8;
  for (let y = 15; y > 8; y--) {
    px(ctx, x, y, P.grassD);
    if (y === 12) { px(ctx, x - 1, y, P.grassD); px(ctx, x - 2, y - 1, P.grass); } // leaf
  }
  // head
  rect(ctx, 6, 4, 4, 4, petal);
  px(ctx, 5, 5, petal); px(ctx, 10, 5, petal);
  px(ctx, 7, 3, petal); px(ctx, 8, 3, petal);
  px(ctx, 7, 8, petal); px(ctx, 8, 8, petal);
  rect(ctx, 7, 5, 2, 2, center);
}

tile('dandelion', (ctx, rng) => flower(ctx, rng, [240, 214, 42], [200, 160, 30]));
tile('poppy', (ctx, rng) => flower(ctx, rng, [214, 48, 48], [40, 40, 40]));

tile('sugar_cane', (ctx, rng) => {
  for (const x of [3, 8, 12]) {
    const col = [126, 188, 106];
    for (let y = 0; y < TILE; y++) {
      px(ctx, x, y, y % 5 === 4 ? [96, 148, 82] : col);
      if (rng() < 0.3) px(ctx, x + 1, y, [148, 204, 124]);
    }
  }
});

tile('dead_bush', (ctx, rng) => {
  const c = [122, 90, 48];
  let branches = [[8, 15]];
  for (let step = 0; step < 10 && branches.length; step++) {
    const next = [];
    for (const [x, y] of branches) {
      px(ctx, x, y, c);
      if (y <= 4) continue;
      if (rng() < 0.35 && next.length < 5) next.push([x - 1, y - 1]);
      if (rng() < 0.35 && next.length < 5) next.push([x + 1, y - 1]);
      if (rng() < 0.8) next.push([x, y - 1]);
    }
    branches = next;
  }
});

// --- ores ---
function ore(ctx, rng, cols) {
  generators['stone'](ctx, rng);
  for (let i = 0; i < 5; i++) {
    blob(ctx, rng, 2 + ((rng() * 12) | 0), 2 + ((rng() * 12) | 0), 5, cols);
  }
}

tile('coal_ore', (ctx, rng) => ore(ctx, rng, [[40, 40, 44], [24, 24, 28], [58, 58, 62]]));
tile('iron_ore', (ctx, rng) => ore(ctx, rng, [[216, 176, 140], [196, 152, 116], [232, 198, 168]]));
tile('gold_ore', (ctx, rng) => ore(ctx, rng, [[248, 210, 70], [222, 180, 50], [255, 232, 120]]));
tile('diamond_ore', (ctx, rng) => ore(ctx, rng, [[96, 226, 222], [64, 196, 200], [160, 246, 240]]));
tile('ember_ore', (ctx, rng) => ore(ctx, rng, [[212, 44, 32], [170, 30, 24], [244, 88, 70]]));

// --- special blocks ---
tile('glass', (ctx, rng) => {
  const edge = [214, 230, 236, 255];
  rect(ctx, 0, 0, TILE, 1, edge);
  rect(ctx, 0, TILE - 1, TILE, 1, edge);
  rect(ctx, 0, 0, 1, TILE, edge);
  rect(ctx, TILE - 1, 0, 1, TILE, edge);
  // faint diagonal streak
  for (let i = 0; i < 6; i++) px(ctx, 3 + i, 9 - i, [240, 250, 254, 120]);
  for (let i = 0; i < 4; i++) px(ctx, 9 + i, 13 - i, [240, 250, 254, 90]);
});

tile('ember_lamp', (ctx, rng) => {
  fillNoise(ctx, rng, [[[252, 218, 108], 6], [[240, 190, 70], 4], [[212, 150, 52], 3], [[255, 240, 170], 2]]);
});

tile('torch', (ctx, rng) => {
  rect(ctx, 7, 6, 2, 10, P.barkOak);       // stick
  rect(ctx, 7, 6, 1, 10, P.barkOakL);
  rect(ctx, 7, 4, 2, 2, [255, 232, 120]);  // flame
  rect(ctx, 7, 3, 2, 1, [255, 190, 60]);
  px(ctx, 7, 2, [255, 140, 40]);
});

tile('workbench_top', (ctx, rng) => {
  planks(ctx, rng, P.woodOak);
  rect(ctx, 0, 0, TILE, 1, P.barkOakD);
  rect(ctx, 0, TILE - 1, TILE, 1, P.barkOakD);
  rect(ctx, 0, 0, 1, TILE, P.barkOakD);
  rect(ctx, TILE - 1, 0, 1, TILE, P.barkOakD);
  rect(ctx, 3, 3, 10, 1, P.barkOakD);      // inset grid
  rect(ctx, 3, 12, 10, 1, P.barkOakD);
  rect(ctx, 3, 3, 1, 10, P.barkOakD);
  rect(ctx, 12, 3, 1, 10, P.barkOakD);
});

tile('workbench_side', (ctx, rng) => {
  planks(ctx, rng, P.woodOak);
  rect(ctx, 0, 0, TILE, 2, shade(P.woodOak, 1.1));
  // implied tool shapes
  rect(ctx, 3, 5, 4, 4, P.barkOakD);
  rect(ctx, 9, 5, 4, 4, shade(P.barkOakD, 1.2));
});

tile('workbench_front', (ctx, rng) => {
  planks(ctx, rng, P.woodOak);
  rect(ctx, 0, 0, TILE, 2, shade(P.woodOak, 1.1));
  rect(ctx, 4, 5, 8, 6, P.barkOakD);
  rect(ctx, 5, 6, 6, 4, P.woodOakD);
});

tile('furnace_top', (ctx, rng) => generators['stone'](ctx, rng));

tile('furnace_side', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.stoneD, 6], [P.stone, 4], [P.stoneDD, 2]]);
  rect(ctx, 0, 0, TILE, 1, P.stone);
  rect(ctx, 0, TILE - 1, TILE, 1, P.stoneDD);
});

tile('furnace_front', (ctx, rng) => {
  generators['furnace_side'](ctx, rng);
  rect(ctx, 4, 6, 8, 7, [40, 40, 40]);
  rect(ctx, 5, 7, 6, 5, [22, 22, 22]);
});

tile('furnace_front_lit', (ctx, rng) => {
  generators['furnace_side'](ctx, rng);
  rect(ctx, 4, 6, 8, 7, [60, 40, 30]);
  rect(ctx, 5, 7, 6, 5, [255, 140, 30]);
  rect(ctx, 6, 8, 4, 3, [255, 210, 80]);
  px(ctx, 6, 7, [255, 240, 160]); px(ctx, 9, 7, [255, 240, 160]);
});

tile('bricks', (ctx, rng) => {
  const mortar = [188, 180, 172];
  const brick = [168, 74, 58];
  rect(ctx, 0, 0, TILE, TILE, mortar);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const off = row % 2 === 0 ? 0 : 4;
    for (let bx = -1; bx < 3; bx++) {
      const x = bx * 8 + off;
      const c = rng() < 0.3 ? shade(brick, 0.88) : brick;
      rect(ctx, x + 1, y + 1, 7, 3, c);
      rect(ctx, x + 1, y + 1, 7, 1, shade(c, 1.1));
    }
  }
});

tile('stone_bricks', (ctx, rng) => {
  fillNoise(ctx, rng, [[P.stone, 7], [P.stoneL, 3], [P.stoneD, 2]]);
  const line = P.stoneDD;
  rect(ctx, 0, 7, TILE, 1, line);
  rect(ctx, 0, 15, TILE, 1, line);
  rect(ctx, 7, 0, 1, 8, line);
  rect(ctx, 3, 8, 1, 8, line);
  rect(ctx, 11, 8, 1, 8, line);
  rect(ctx, 0, 0, TILE, 1, shade(P.stoneL, 1.05));
});

tile('obsidian', (ctx, rng) => {
  fillNoise(ctx, rng, [[[24, 18, 38], 7], [[16, 12, 26], 4], [[42, 30, 62], 3]]);
  speckle(ctx, rng, [96, 70, 140], 4);
});

tile('wool', (ctx, rng) => {
  fillNoise(ctx, rng, [[[228, 228, 222], 7], [[214, 214, 206], 4], [[240, 240, 236], 3]]);
  for (let y = 0; y < TILE; y += 4) {
    for (let x = 0; x < TILE; x += 4) {
      if ((x + y) % 8 === 0) rect(ctx, x, y, 2, 1, [202, 202, 194]);
    }
  }
});

tile('pumpkin_side', (ctx, rng) => {
  const o = [216, 128, 32], oD = [184, 102, 24], oL = [236, 152, 52];
  rect(ctx, 0, 0, TILE, TILE, o);
  for (let x = 1; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, oD);   // ribs
  for (let x = 3; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, oL);
  rect(ctx, 0, 0, TILE, 1, oD);
  rect(ctx, 0, TILE - 1, TILE, 1, oD);
});

tile('pumpkin_top', (ctx, rng) => {
  rect(ctx, 0, 0, TILE, TILE, [196, 112, 28]);
  rect(ctx, 1, 1, 14, 14, [216, 128, 32]);
  rect(ctx, 6, 6, 4, 4, [92, 118, 42]);    // stem
  rect(ctx, 7, 7, 2, 2, [72, 94, 34]);
});

tile('pumpkin_face', (ctx, rng) => {
  generators['pumpkin_side'](ctx, rng);
  const dark = [50, 30, 10];
  // carved eyes + mouth
  rect(ctx, 3, 5, 3, 2, dark); rect(ctx, 10, 5, 3, 2, dark);
  px(ctx, 4, 4, dark); px(ctx, 11, 4, dark);
  rect(ctx, 4, 10, 8, 2, dark);
  px(ctx, 3, 9, dark); px(ctx, 12, 9, dark); px(ctx, 7, 12, dark); px(ctx, 8, 12, dark);
});

function mushroom(ctx, rng, cap, capD) {
  rect(ctx, 7, 9, 2, 6, [222, 214, 196]);  // stem
  rect(ctx, 5, 5, 6, 3, cap);              // cap
  rect(ctx, 4, 6, 8, 2, cap);
  rect(ctx, 6, 4, 4, 1, capD);
  px(ctx, 6, 6, capD); px(ctx, 9, 5, capD);
}

tile('mushroom_brown', (ctx, rng) => mushroom(ctx, rng, [150, 112, 82], [124, 90, 64]));
tile('mushroom_red', (ctx, rng) => {
  mushroom(ctx, rng, [200, 46, 40], [160, 34, 30]);
  px(ctx, 6, 5, [240, 236, 228]); px(ctx, 9, 6, [240, 236, 228]);
});

// ---------- item icons ----------

tile('stick', (ctx) => {
  for (let i = 0; i < 9; i++) {
    px(ctx, 4 + i, 12 - i, P.barkOak);
    px(ctx, 5 + i, 12 - i, P.barkOakL);
  }
});

tile('coal', (ctx, rng) => {
  blobIcon(ctx, rng, [[36, 36, 40], [22, 22, 26], [52, 52, 58]]);
});

tile('clay_ball', (ctx, rng) => {
  blobIcon(ctx, rng, [[160, 166, 180], [144, 150, 166], [176, 182, 194]]);
});

function blobIcon(ctx, rng, cols) {
  for (let i = 0; i < 26; i++) {
    const x = 5 + ((rng() * 6) | 0);
    const y = 5 + ((rng() * 6) | 0);
    px(ctx, x, y, cols[(rng() * cols.length) | 0]);
  }
  rect(ctx, 6, 6, 4, 4, cols[0]);
}

function ingot(ctx, base, light, dark) {
  // slanted bar
  for (let i = 0; i < 4; i++) {
    rect(ctx, 3 + i, 10 - i, 8, 1, base);
  }
  rect(ctx, 3, 10, 8, 2, dark);
  rect(ctx, 6, 7, 8, 1, light);
  for (let i = 0; i < 3; i++) px(ctx, 13, 8 + i, dark);
}

tile('iron_ingot', (ctx) => ingot(ctx, [216, 216, 220], [240, 240, 244], [168, 168, 176]));
tile('gold_ingot', (ctx) => ingot(ctx, [244, 200, 60], [255, 236, 130], [196, 150, 36]));

tile('diamond', (ctx) => {
  const c = [92, 226, 220], l = [180, 250, 246], d = [52, 172, 176];
  rect(ctx, 5, 5, 6, 2, l);
  rect(ctx, 4, 7, 8, 2, c);
  rect(ctx, 5, 9, 6, 1, c);
  rect(ctx, 6, 10, 4, 1, d);
  rect(ctx, 7, 11, 2, 1, d);
  px(ctx, 5, 6, [230, 255, 253]);
});

tile('ember_dust', (ctx, rng) => {
  for (let i = 0; i < 30; i++) {
    const x = 3 + ((rng() * 10) | 0);
    const y = 8 + ((rng() * 6) | 0) - (((x - 8) * (x - 8)) >> 3);
    px(ctx, x, y, rng() < 0.5 ? [212, 44, 32] : [170, 28, 22]);
  }
});

function meat(ctx, rng, flesh, fleshD, edge) {
  rect(ctx, 4, 4, 8, 8, flesh);
  rect(ctx, 5, 3, 6, 1, flesh);
  rect(ctx, 5, 12, 6, 1, flesh);
  rect(ctx, 4, 4, 1, 8, edge);
  rect(ctx, 11, 4, 1, 8, edge);
  speckle(ctx, rng, fleshD, 6);
  // bone
  rect(ctx, 11, 10, 3, 2, [240, 236, 224]);
}

tile('raw_pork', (ctx, rng) => meat(ctx, rng, [238, 140, 140], [216, 110, 110], [246, 190, 180]));
tile('roast_pork', (ctx, rng) => meat(ctx, rng, [180, 112, 60], [150, 88, 44], [214, 152, 96]));
tile('raw_mutton', (ctx, rng) => meat(ctx, rng, [210, 90, 90], [180, 66, 66], [232, 150, 140]));
tile('roast_mutton', (ctx, rng) => meat(ctx, rng, [160, 96, 48], [132, 74, 36], [196, 134, 82]));

tile('apple', (ctx) => {
  const r = [212, 50, 44], rD = [170, 34, 30], rL = [238, 96, 84];
  rect(ctx, 5, 6, 6, 6, r);
  rect(ctx, 4, 7, 8, 4, r);
  px(ctx, 6, 7, rL); px(ctx, 6, 8, rL);
  rect(ctx, 6, 12, 4, 1, rD);
  px(ctx, 8, 5, P.barkOak); px(ctx, 8, 4, P.barkOak);
  px(ctx, 9, 4, P.grassD); px(ctx, 10, 3, P.grassD);
});

tile('murk_jelly', (ctx, rng) => {
  fillNoiseRegion(ctx, rng, 4, 5, 9, 7, [[[92, 78, 132], 5], [[70, 60, 104], 4], [[122, 108, 166], 3]]);
  px(ctx, 6, 7, [232, 242, 122]); px(ctx, 10, 9, [200, 212, 110]);
});

function fillNoiseRegion(ctx, rng, x0, y0, w, h, colors) {
  let total = 0;
  for (const [, wt] of colors) total += wt;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      let r = rng() * total;
      for (const [col, wt] of colors) {
        r -= wt;
        if (r <= 0) { px(ctx, x, y, col); break; }
      }
    }
  }
}

tile('brick_item', (ctx) => {
  rect(ctx, 4, 6, 8, 5, [168, 74, 58]);
  rect(ctx, 4, 6, 8, 1, [196, 96, 76]);
  rect(ctx, 4, 10, 8, 1, [136, 56, 44]);
});

// --- tools: pixel maps. H=handle, h=handle shade, M=material, m=material shade ---

const TOOL_MAPS = {
  pickaxe: [
    '....mMMMMMm.....',
    '...MM.....MMm...',
    '..Mm...HH...Mm..',
    '..M...Hh.M...M..',
    '.....Hh...m..m..',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '.Hh.............',
    'Hh..............',
  ],
  axe: [
    '....mMMm........',
    '...MMMMMm.......',
    '...MMhHMM.......',
    '...mMHh.m.......',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '.Hh.............',
    'Hh..............',
  ],
  shovel: [
    '......mMMm......',
    '.....MMMMM......',
    '.....mMMMm......',
    '......mHm.......',
    '.....Hh.........',
    '....Hh..........',
    '...Hh...........',
    '..Hh............',
    '.Hh.............',
  ],
  sword: [
    '..........mM....',
    '.........MMm....',
    '........MMm.....',
    '.......MMm......',
    '......MMm.......',
    '.....MMm........',
    '.hh.MMm.........',
    '..hHhm..........',
    '..Hhh...........',
    '.Hh.hh..........',
  ],
};

const TOOL_MATERIALS = {
  wood: { M: [158, 122, 74], m: [122, 94, 56] },
  stone: { M: [136, 136, 136], m: [100, 100, 100] },
  iron: { M: [222, 222, 228], m: [170, 170, 180] },
  gold: { M: [246, 204, 62], m: [200, 156, 40] },
  diamond: { M: [96, 226, 220], m: [56, 178, 180] },
};

for (const mat of Object.keys(TOOL_MATERIALS)) {
  for (const cls of Object.keys(TOOL_MAPS)) {
    tile(`${mat}_${cls}`, (ctx) => {
      const cols = {
        H: [122, 94, 56], h: [94, 72, 42],
        M: TOOL_MATERIALS[mat].M, m: TOOL_MATERIALS[mat].m,
      };
      const map = TOOL_MAPS[cls];
      const yOff = 16 - map.length - 1;
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
          const ch = map[y][x];
          if (cols[ch]) px(ctx, x, y + yOff, cols[ch]);
        }
      }
    });
  }
}

// --- breaking crack overlays (5 stages) ---
for (let stage = 0; stage < 5; stage++) {
  tile(`crack_${stage}`, (ctx, rng) => {
    const n = 6 + stage * 9;
    const col = [20, 20, 20, 190];
    // random walk cracks radiating from centre
    for (let c = 0; c < 2 + stage; c++) {
      let x = 6 + ((rng() * 4) | 0), y = 6 + ((rng() * 4) | 0);
      for (let s = 0; s < n / 2; s++) {
        px(ctx, x, y, col);
        const d = (rng() * 4) | 0;
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
        if (x < 0 || y < 0 || x > 15 || y > 15) break;
      }
    }
  });
}

// --- sky sprites ---
tile('sun', (ctx) => {
  rect(ctx, 2, 2, 12, 12, [255, 240, 170]);
  rect(ctx, 4, 4, 8, 8, [255, 250, 220]);
});

tile('moon', (ctx) => {
  rect(ctx, 3, 3, 10, 10, [212, 216, 228]);
  rect(ctx, 5, 5, 6, 6, [232, 236, 244]);
  rect(ctx, 5, 5, 3, 3, [188, 192, 208]);
  px(ctx, 9, 8, [188, 192, 208]); px(ctx, 7, 10, [188, 192, 208]);
});

// ---------- public API ----------

export function tileNames() {
  return Object.keys(generators);
}

const tileCache = new Map();

// Render a tile into a fresh 16x16 canvas (cached).
export function generateTile(name) {
  if (tileCache.has(name)) return tileCache.get(name);
  const gen = generators[name];
  if (!gen) throw new Error(`Unknown tile: ${name}`);
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, TILE, TILE);
  gen(ctx, coordRng(0xB10C5EED, hashString(name), 7));
  tileCache.set(name, canvas);
  return canvas;
}
