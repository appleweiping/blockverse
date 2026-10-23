// Deterministic, seed-driven terrain generation. This module is pure
// (no DOM, no THREE) so it can run inside Web Workers.

import { CHUNK_X, CHUNK_Y, CHUNK_Z, SEA_LEVEL, blockIndex } from '../core/constants.js';
import { Noise } from '../core/noise.js';
import { coordRng } from '../core/rng.js';
import { B } from '../blocks/blocks.js';
import { VENT_REACH } from './wind.js';

export const BIOME = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH_FOREST: 4,
  DESERT: 5, SNOWY: 6, SNOWY_FOREST: 7, SWAMP: 8, MOUNTAINS: 9,
};

export const BIOME_NAMES = [
  'Ocean', 'Beach', 'Plains', 'Forest', 'Birch Forest',
  'Desert', 'Snowy Tundra', 'Snowy Forest', 'Swamp', 'Mountains',
];

// Sky islands: a sparse 2D noise mask decides where they float; the mask
// value sets how thick each column is, so islands are flat on top and hang
// down like an upside-down hill. Wind vents sit on the ground just outside
// an island's shadow.
export const ISLE_THRESHOLD = 0.3;
export const ISLE_CLEARANCE = 12;   // min air between terrain and island bottom
const ISLE_EDGE = [ISLE_THRESHOLD - 0.06, ISLE_THRESHOLD - 0.012];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.continent = new Noise(seed + 1);
    this.erosion = new Noise(seed + 2);
    this.peaks = new Noise(seed + 3);
    this.detail = new Noise(seed + 4);
    this.temp = new Noise(seed + 5);
    this.moist = new Noise(seed + 6);
    this.cave1 = new Noise(seed + 7);
    this.cave2 = new Noise(seed + 8);
    this.mountainMask = new Noise(seed + 9);
    this.cavern = new Noise(seed + 10);
    this.isle = new Noise(seed + 11);
    this.isleAlt = new Noise(seed + 12);
    this.isleCrag = new Noise(seed + 13);
  }

  isleMask(wx, wz) {
    return this.isle.fbm2(wx / 90, wz / 90, 3);
  }

  // Sky island column at (wx, wz) as { top, bottom } (inclusive), or null.
  islandAt(wx, wz, ground) {
    const v = this.isleMask(wx, wz);
    if (v <= ISLE_THRESHOLD) return null;
    ground ??= this.heightAt(wx, wz);
    const t = Math.min(1, (v - ISLE_THRESHOLD) / 0.16);
    const base = Math.round(96 + this.isleAlt.noise2(wx / 260, wz / 260) * 7);
    const crag = (this.isleCrag.noise2(wx / 9, wz / 9) + 1) / 2;
    const top = base + Math.round(t * 3);
    const bottom = base - 1 - Math.round(Math.pow(t, 0.7) * 18 * (0.65 + 0.35 * crag));
    if (bottom - ground < ISLE_CLEARANCE) return null; // too close to a mountain
    return { top, bottom };
  }

  // Is there an island column within r blocks (sampled on two rings)?
  islandWithin(wx, wz, r) {
    for (const d of [r / 2, r]) {
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        if (this.islandAt(Math.round(wx + Math.cos(ang) * d), Math.round(wz + Math.sin(ang) * d))) return true;
      }
    }
    return false;
  }

  // Just outside an island: where natural wind vents may appear.
  nearIslandEdge(wx, wz) {
    const v = this.isleMask(wx, wz);
    return v > ISLE_EDGE[0] && v < ISLE_EDGE[1];
  }

  // Terrain height (pre-cave, pre-decoration). Pure function of (x, z).
  heightAt(wx, wz) {
    const c = this.continent.fbm2(wx / 700, wz / 700, 4);
    const e = (this.erosion.fbm2(wx / 400, wz / 400, 3) + 1) / 2;
    const mMask = smoothstep(0.15, 0.55, this.mountainMask.noise2(wx / 520, wz / 520));
    const ridge = this.peaks.ridge2(wx / 230, wz / 230, 4);
    const detail = this.detail.fbm2(wx / 60, wz / 60, 3) * (4 - e * 2.5);

    let h = 42 + c * 16 + detail;
    h += Math.pow(Math.max(0, ridge - 0.35), 1.6) * 52 * mMask;

    // Swamps flatten terrain toward the waterline.
    const t = this.tempAt(wx, wz);
    const m = this.moistAt(wx, wz);
    if (m > 0.72 && t > 0.35 && t < 0.7 && mMask < 0.3 && h > SEA_LEVEL - 1 && h < SEA_LEVEL + 8) {
      h = SEA_LEVEL + 1 + (h - SEA_LEVEL - 1) * 0.25;
    }

    return Math.max(4, Math.min(CHUNK_Y - 10, h));
  }

  tempAt(wx, wz) {
    return (this.temp.fbm2(wx / 900, wz / 900, 3) + 1) / 2;
  }

  moistAt(wx, wz) {
    return (this.moist.fbm2(wx / 640, wz / 640, 3) + 1) / 2;
  }

  biomeAt(wx, wz) {
    const h = this.heightAt(wx, wz);
    const t = this.tempAt(wx, wz);
    const m = this.moistAt(wx, wz);
    const mMask = smoothstep(0.15, 0.55, this.mountainMask.noise2(wx / 520, wz / 520));

    if (h < SEA_LEVEL - 2) return BIOME.OCEAN;
    if (h > 74 && mMask > 0.35) return BIOME.MOUNTAINS;
    if (h <= SEA_LEVEL + 1.5 && t > 0.3) return BIOME.BEACH;
    if (t < 0.28) return m > 0.55 ? BIOME.SNOWY_FOREST : BIOME.SNOWY;
    if (t > 0.68 && m < 0.38) return BIOME.DESERT;
    if (m > 0.72 && t > 0.35 && t < 0.7) return BIOME.SWAMP;
    if (m > 0.52) return t > 0.42 && t < 0.62 && m < 0.64 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    return BIOME.PLAINS;
  }

  isCave(wx, wy, wz, surface) {
    if (wy < 6 || wy > surface + 1) return false;
    // Spaghetti tunnels: intersection of two noise bands.
    const n1 = this.cave1.fbm3(wx / 26, wy / 20, wz / 26, 2);
    const n2 = this.cave2.fbm3(wx / 26, wy / 20, wz / 26, 2);
    if (Math.abs(n1) < 0.09 && Math.abs(n2) < 0.09) return true;
    // Cheese caverns deep down.
    if (wy < 34) {
      const c = this.cavern.fbm3(wx / 46, wy / 30, wz / 46, 2);
      if (c > 0.44 + (wy / 34) * 0.18) return true;
    }
    return false;
  }

  generateChunk(cx, cz) {
    const blocks = new Uint16Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
    const heightMap = new Uint8Array(CHUNK_X * CHUNK_Z);
    const biomeMap = new Uint8Array(CHUNK_X * CHUNK_Z);
    const bedrockRng = coordRng(this.seed, cx, cz, 1);

    for (let x = 0; x < CHUNK_X; x++) {
      for (let z = 0; z < CHUNK_Z; z++) {
        const wx = cx * CHUNK_X + x;
        const wz = cz * CHUNK_Z + z;
        const hF = this.heightAt(wx, wz);
        const h = Math.floor(hF);
        const biome = this.biomeAt(wx, wz);
        heightMap[x * CHUNK_Z + z] = h;
        biomeMap[x * CHUNK_Z + z] = biome;

        const snowy = biome === BIOME.SNOWY || biome === BIOME.SNOWY_FOREST ||
          (biome === BIOME.MOUNTAINS && h > 86);
        const sandy = biome === BIOME.DESERT || biome === BIOME.BEACH ||
          (biome === BIOME.OCEAN && h > SEA_LEVEL - 8);

        for (let y = 0; y <= Math.max(h, SEA_LEVEL); y++) {
          const idx = blockIndex(x, y, z);
          let id = B.AIR;

          if (y > h) {
            id = y <= SEA_LEVEL ? B.WATER : B.AIR;
            if (id === B.WATER && y === SEA_LEVEL && snowy && biome !== BIOME.MOUNTAINS) id = B.ICE;
          } else if (y === 0 || (y === 1 && bedrockRng() < 0.5)) {
            id = B.BEDROCK;
          } else if (this.isCave(wx, y, wz, h)) {
            id = y <= 9 ? B.WATER : B.AIR; // lava would go here; use water pools deep down
          } else if (y === h) {
            // surface block
            if (y < SEA_LEVEL - 1) id = sandy ? B.SAND : (biome === BIOME.OCEAN ? B.GRAVEL : B.DIRT);
            else if (sandy) id = B.SAND;
            else if (snowy) id = B.SNOWY_GRASS;
            else if (biome === BIOME.MOUNTAINS && h > 68) id = B.STONE;
            else id = B.GRASS;
          } else if (y > h - 4) {
            // subsurface strata
            if (sandy) id = y > h - 3 ? B.SAND : B.SANDSTONE;
            else if (biome === BIOME.MOUNTAINS && h > 68) id = B.STONE;
            else id = B.DIRT;
          } else {
            id = B.STONE;
          }
          blocks[idx] = id;
        }

        const isle = this.islandAt(wx, wz, hF);
        if (isle) {
          for (let y = isle.bottom; y <= isle.top; y++) {
            blocks[blockIndex(x, y, z)] = y === isle.top ? B.GRASS : y >= isle.top - 2 ? B.DIRT : B.SKYSTONE;
          }
        }

        // occasional clay pockets under water
        if (biome === BIOME.OCEAN || biome === BIOME.SWAMP) {
          const r = coordRng(this.seed, wx, wz, 33)();
          if (r < 0.06 && h > 4) blocks[blockIndex(x, h, z)] = B.CLAY;
        }
      }
    }

    this.placeOres(blocks, cx, cz, heightMap);
    this.decorate(blocks, cx, cz);

    return { blocks, heightMap, biomeMap };
  }

  placeOres(blocks, cx, cz, heightMap) {
    // [block, attempts per chunk, blob size, minY, maxY]
    const ORES = [
      [B.COAL_ORE, 14, 10, 6, 96],
      [B.IRON_ORE, 10, 6, 4, 54],
      [B.GOLD_ORE, 3, 5, 4, 30],
      [B.EMBER_ORE, 6, 6, 4, 16],
      [B.DIAMOND_ORE, 2, 5, 4, 14],
      [B.GRAVEL, 6, 14, 8, 60],
      [B.DIRT, 8, 14, 8, 70],
    ];
    for (let o = 0; o < ORES.length; o++) {
      const [id, attempts, size, minY, maxY] = ORES[o];
      const rng = coordRng(this.seed, cx, cz, 100 + o);
      for (let a = 0; a < attempts; a++) {
        let x = (rng() * CHUNK_X) | 0;
        let y = minY + ((rng() * (maxY - minY)) | 0);
        let z = (rng() * CHUNK_Z) | 0;
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < CHUNK_X && y > 1 && y < CHUNK_Y && z >= 0 && z < CHUNK_Z) {
            const idx = blockIndex(x, y, z);
            if (blocks[idx] === B.STONE) blocks[idx] = id;
          }
          const dir = (rng() * 6) | 0;
          if (dir === 0) x++; else if (dir === 1) x--;
          else if (dir === 2) y++; else if (dir === 3) y--;
          else if (dir === 4) z++; else z--;
        }
      }
    }
  }

  // Features from the 3x3 chunk neighbourhood may reach into this chunk.
  // Each feature is fully determined by its origin chunk's seed, so every
  // chunk that overlaps it generates the exact same blocks.
  // Vents go last so no neighbouring tree can grow into their column.
  decorate(blocks, cx, cz) {
    const vents = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const f of this.chunkFeatures(cx + dx, cz + dz)) {
          if (f.type === 'vent') vents.push(f);
          else this.applyFeature(blocks, cx, cz, f);
        }
      }
    }
    for (const f of vents) this.applyFeature(blocks, cx, cz, f);
  }

  chunkFeatures(cx, cz) {
    const rng = coordRng(this.seed, cx, cz, 777);
    const features = [];
    const baseX = cx * CHUNK_X;
    const baseZ = cz * CHUNK_Z;

    // sample biome at chunk centre to decide densities
    const biome = this.biomeAt(baseX + 8, baseZ + 8);

    let trees = 0, treeKind = 'oak';
    switch (biome) {
      case BIOME.FOREST: trees = 6 + ((rng() * 4) | 0); treeKind = 'oak'; break;
      case BIOME.BIRCH_FOREST: trees = 5 + ((rng() * 4) | 0); treeKind = 'birch'; break;
      case BIOME.SNOWY_FOREST: trees = 4 + ((rng() * 3) | 0); treeKind = 'spruce'; break;
      case BIOME.PLAINS: trees = rng() < 0.25 ? 1 : 0; treeKind = 'oak'; break;
      case BIOME.SWAMP: trees = 2 + ((rng() * 2) | 0); treeKind = 'oak'; break;
      case BIOME.MOUNTAINS: trees = rng() < 0.4 ? 1 : 0; treeKind = 'spruce'; break;
      default: trees = 0;
    }

    for (let i = 0; i < trees; i++) {
      const wx = baseX + ((rng() * CHUNK_X) | 0);
      const wz = baseZ + ((rng() * CHUNK_Z) | 0);
      const h = Math.floor(this.heightAt(wx, wz));
      if (h <= SEA_LEVEL) continue;
      const kind = treeKind === 'oak' && rng() < 0.12 ? 'birch' : treeKind;
      features.push({ type: 'tree', kind, wx, wy: h + 1, wz, size: 4 + ((rng() * 3) | 0), rng: coordRng(this.seed, wx, wz, 555) });
    }

    if (biome === BIOME.DESERT) {
      const n = (rng() * 3) | 0;
      for (let i = 0; i < n; i++) {
        const wx = baseX + ((rng() * CHUNK_X) | 0);
        const wz = baseZ + ((rng() * CHUNK_Z) | 0);
        const h = Math.floor(this.heightAt(wx, wz));
        if (h <= SEA_LEVEL) continue;
        features.push({ type: 'cactus', wx, wy: h + 1, wz, size: 1 + ((rng() * 3) | 0) });
      }
      if (rng() < 0.3) {
        const wx = baseX + ((rng() * CHUNK_X) | 0);
        const wz = baseZ + ((rng() * CHUNK_Z) | 0);
        const h = Math.floor(this.heightAt(wx, wz));
        if (h > SEA_LEVEL) features.push({ type: 'plant', block: B.DEAD_BUSH, wx, wy: h + 1, wz });
      }
    }

    // grass, flowers, pumpkins, mushrooms, sugar cane
    const grassCount = biome === BIOME.PLAINS ? 24 : biome === BIOME.FOREST || biome === BIOME.BIRCH_FOREST ? 12 : biome === BIOME.SWAMP ? 10 : 0;
    for (let i = 0; i < grassCount; i++) {
      const wx = baseX + ((rng() * CHUNK_X) | 0);
      const wz = baseZ + ((rng() * CHUNK_Z) | 0);
      const h = Math.floor(this.heightAt(wx, wz));
      if (h <= SEA_LEVEL) continue;
      let block = B.TALL_GRASS;
      const r = rng();
      if (r < 0.08) block = B.DANDELION;
      else if (r < 0.16) block = B.POPPY;
      features.push({ type: 'plant', block, wx, wy: h + 1, wz });
    }
    if (biome === BIOME.SWAMP) {
      for (let i = 0; i < 4; i++) {
        const wx = baseX + ((rng() * CHUNK_X) | 0);
        const wz = baseZ + ((rng() * CHUNK_Z) | 0);
        const h = Math.floor(this.heightAt(wx, wz));
        if (h > SEA_LEVEL) features.push({ type: 'plant', block: rng() < 0.5 ? B.MUSHROOM_BROWN : B.MUSHROOM_RED, wx, wy: h + 1, wz });
      }
    }
    if ((biome === BIOME.PLAINS || biome === BIOME.FOREST) && rng() < 0.06) {
      const wx = baseX + ((rng() * CHUNK_X) | 0);
      const wz = baseZ + ((rng() * CHUNK_Z) | 0);
      const h = Math.floor(this.heightAt(wx, wz));
      if (h > SEA_LEVEL) features.push({ type: 'plant', block: B.PUMPKIN, wx, wy: h + 1, wz });
    }
    // sugar cane at the waterline
    if (biome === BIOME.BEACH || biome === BIOME.SWAMP || biome === BIOME.PLAINS) {
      for (let i = 0; i < 3; i++) {
        const wx = baseX + ((rng() * CHUNK_X) | 0);
        const wz = baseZ + ((rng() * CHUNK_Z) | 0);
        const h = Math.floor(this.heightAt(wx, wz));
        if (h === SEA_LEVEL || h === SEA_LEVEL + 1) {
          features.push({ type: 'cane', wx, wy: h + 1, wz, size: 2 + ((rng() * 2) | 0) });
        }
      }
    }
    this.islandFeatures(cx, cz, features);
    return features;
  }

  // Trees and grass on sky islands, and at most one wind vent per chunk.
  // Separate rng stream, so the ground features above stay as they were.
  islandFeatures(cx, cz, features) {
    const rng = coordRng(this.seed, cx, cz, 778);
    const baseX = cx * CHUNK_X;
    const baseZ = cz * CHUNK_Z;
    for (let i = 0; i < 10; i++) {
      const wx = baseX + ((rng() * CHUNK_X) | 0);
      const wz = baseZ + ((rng() * CHUNK_Z) | 0);
      const roll = rng();
      const isle = this.islandAt(wx, wz);
      if (!isle) continue;
      if (i < 2 && isle.top - isle.bottom >= 6) {
        if (roll < 0.7) {
          features.push({
            type: 'tree', kind: roll < 0.5 ? 'oak' : 'birch', wx, wy: isle.top + 1, wz,
            size: 4 + ((rng() * 2) | 0), rng: coordRng(this.seed, wx, wz, 556),
          });
        }
      } else {
        features.push({ type: 'plant', block: roll < 0.15 ? B.DANDELION : B.TALL_GRASS, wx, wy: isle.top + 1, wz });
      }
    }
    if (rng() < 0.6) {
      for (let i = 0; i < 12; i++) {
        const wx = baseX + 1 + ((rng() * (CHUNK_X - 2)) | 0);
        const wz = baseZ + 1 + ((rng() * (CHUNK_Z - 2)) | 0);
        if (!this.nearIslandEdge(wx, wz) || !this.islandWithin(wx, wz, 8)) continue;
        const h = Math.floor(this.heightAt(wx, wz));
        if (h <= SEA_LEVEL + 1) continue;
        features.push({ type: 'vent', wx, wy: h, wz });
        break;
      }
    }
  }

  applyFeature(blocks, cx, cz, f) {
    const put = (wx, wy, wz, id, onlyAir = true) => {
      const x = wx - cx * CHUNK_X;
      const z = wz - cz * CHUNK_Z;
      if (x < 0 || x >= CHUNK_X || z < 0 || z >= CHUNK_Z || wy < 0 || wy >= CHUNK_Y) return;
      const idx = blockIndex(x, wy, z);
      if (onlyAir && blocks[idx] !== B.AIR) return;
      blocks[idx] = id;
    };
    const get = (wx, wy, wz) => {
      const x = wx - cx * CHUNK_X;
      const z = wz - cz * CHUNK_Z;
      if (x < 0 || x >= CHUNK_X || z < 0 || z >= CHUNK_Z || wy < 0 || wy >= CHUNK_Y) return -1;
      return blocks[blockIndex(x, wy, z)];
    };

    switch (f.type) {
      case 'tree': this.buildTree(put, f); break;
      case 'cactus':
        for (let i = 0; i < f.size; i++) put(f.wx, f.wy + i, f.wz, B.CACTUS);
        break;
      case 'cane':
        for (let i = 0; i < f.size; i++) put(f.wx, f.wy + i, f.wz, B.SUGAR_CANE);
        break;
      case 'plant':
        put(f.wx, f.wy, f.wz, f.block);
        break;
      case 'vent': {
        put(f.wx, f.wy, f.wz, B.WIND_VENT, false);
        // keep the column open
        for (let y = f.wy + 1; y <= f.wy + VENT_REACH; y++) put(f.wx, y, f.wz, B.AIR, false);
        // ring of skystone in the ground so you can spot it
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (!dx && !dz) continue;
            for (let y = f.wy + 1; y >= f.wy - 1; y--) {
              const id = get(f.wx + dx, y, f.wz + dz);
              if (id === B.GRASS || id === B.SNOWY_GRASS || id === B.DIRT || id === B.SAND || id === B.STONE) {
                if (get(f.wx + dx, y + 1, f.wz + dz) === B.AIR) put(f.wx + dx, y, f.wz + dz, B.SKYSTONE, false);
                break;
              }
            }
          }
        }
        break;
      }
    }
  }

  buildTree(put, f) {
    const { kind, wx, wy, wz } = f;
    const rng = f.rng ?? coordRng(this.seed, wx, wz, 555);
    if (kind === 'spruce') {
      const h = f.size + 3;
      for (let i = 0; i < h; i++) put(wx, wy + i, wz, B.SPRUCE_LOG, false);
      // conical leaf layers
      let radius = 2;
      for (let layer = h; layer >= 2; layer -= 1) {
        const r = layer === h ? 0 : radius;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > r + (layer % 2 ? 0 : 1)) continue;
            if (dx === 0 && dz === 0 && layer < h) continue;
            put(wx + dx, wy + layer, wz + dz, B.SPRUCE_LEAVES);
          }
        }
        put(wx, wy + h + 1, wz, B.SPRUCE_LEAVES);
        radius = layer % 2 ? 1 : 2;
      }
      return;
    }

    const log = kind === 'birch' ? B.BIRCH_LOG : B.OAK_LOG;
    const leaf = kind === 'birch' ? B.BIRCH_LEAVES : B.OAK_LEAVES;
    const h = f.size + (kind === 'birch' ? 2 : 0);
    for (let i = 0; i < h; i++) put(wx, wy + i, wz, log, false);
    // canopy: two wide layers + cap
    for (let dy = h - 3; dy <= h - 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0) continue;
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng() < 0.4) continue;
          put(wx + dx, wy + dy, wz + dz, leaf);
        }
      }
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1 && rng() < 0.5) continue;
        put(wx + dx, wy + h - 1, wz + dz, leaf);
      }
    }
    put(wx, wy + h, wz, leaf);
    put(wx + 1, wy + h, wz, leaf);
    put(wx - 1, wy + h, wz, leaf);
    put(wx, wy + h, wz + 1, leaf);
    put(wx, wy + h, wz - 1, leaf);
  }
}
