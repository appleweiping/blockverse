import { CHUNK_X, CHUNK_Y, CHUNK_Z, CHUNK_VOLUME, blockIndex } from '../core/constants.js';
import { B } from '../blocks/blocks.js';

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = null;        // Uint16Array
    this.meta = null;          // Uint8Array (orientation for furnaces etc.), lazy
    this.skyLight = null;      // Uint8Array 0..15
    this.blockLight = null;    // Uint8Array 0..15
    this.heightMap = null;     // Uint8Array 16*16 terrain height (worldgen)
    this.biomeMap = null;      // Uint8Array 16*16

    this.hasBlocks = false;
    this.hasLight = false;
    this.mesh = null;          // { opaque: THREE.Mesh|null, water: THREE.Mesh|null }
    this.meshDirty = false;
    this.modified = false;     // needs saving
    this.generating = false;
    this.blockEntities = new Map(); // localIndex -> entity data (furnace state)
    this.vents = new Set();         // local indices of wind vents (for the wind effect)
  }

  setData(blocks, heightMap, biomeMap) {
    this.blocks = blocks;
    this.heightMap = heightMap;
    this.biomeMap = biomeMap;
    this.hasBlocks = true;
    this.vents.clear();
    for (let i = 0; i < blocks.length; i++) if (blocks[i] === B.WIND_VENT) this.vents.add(i);
  }

  ensureMeta() {
    if (!this.meta) this.meta = new Uint8Array(CHUNK_VOLUME);
    return this.meta;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_Y) return 0;
    return this.blocks[blockIndex(x, y, z)];
  }

  setBlock(x, y, z, id) {
    this.blocks[blockIndex(x, y, z)] = id;
    this.modified = true;
  }

  getMeta(x, y, z) {
    return this.meta ? this.meta[blockIndex(x, y, z)] : 0;
  }

  setMeta(x, y, z, m) {
    if (!m && !this.meta) return;
    this.ensureMeta()[blockIndex(x, y, z)] = m;
    this.modified = true;
  }

  getSky(x, y, z) {
    if (y >= CHUNK_Y) return 15;
    if (y < 0) return 0;
    return this.skyLight[blockIndex(x, y, z)];
  }

  getBlockLight(x, y, z) {
    if (y < 0 || y >= CHUNK_Y) return 0;
    return this.blockLight[blockIndex(x, y, z)];
  }
}
