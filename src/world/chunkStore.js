// ChunkStore: the loaded chunks plus world-space block / light / meta
// access. No DOM and no three.js, so the lighting and growth rules can be
// unit-tested in Node. World (world.js) extends this with streaming,
// worker generation and meshing.

import { CHUNK_Y, CHUNK_Z, blockIndex } from '../core/constants.js';
import { B, BLOCKS } from '../blocks/blocks.js';
import { chunkKey } from './chunk.js';
import { lightBlockChange } from './light.js';

export class ChunkStore {
  constructor() {
    this.chunks = new Map();
    this.dirtyMeshes = new Set(); // chunk keys needing a mesh rebuild
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getBlockW(wx, wy, wz) {
    if (wy < 0) return B.BEDROCK;         // below the world: solid
    if (wy >= CHUNK_Y) return B.AIR;
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c || !c.hasBlocks) return B.BEDROCK; // unloaded: treat as solid
    return c.blocks[blockIndex(wx & 15, wy, wz & 15)];
  }

  isLoaded(wx, wz) {
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    return !!(c && c.hasBlocks);
  }

  getSkyW(wx, wy, wz) {
    if (wy >= CHUNK_Y) return 15;
    if (wy < 0) return 0;
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c || !c.hasLight) return 15;
    return c.skyLight[blockIndex(wx & 15, wy, wz & 15)];
  }

  getBlockLightW(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_Y) return 0;
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c || !c.hasLight) return 0;
    return c.blockLight[blockIndex(wx & 15, wy, wz & 15)];
  }

  getMetaW(wx, wy, wz) {
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c || wy < 0 || wy >= CHUNK_Y) return 0;
    return c.getMeta(wx & 15, wy, wz & 15);
  }

  // Change only the meta byte (no relight, no mesh change). Returns false if
  // the chunk isn't loaded.
  setMetaW(wx, wy, wz, meta) {
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c || !c.hasBlocks || wy < 0 || wy >= CHUNK_Y) return false;
    c.setMeta(wx & 15, wy, wz & 15, meta);
    return true;
  }

  // Set a block, updating light and marking meshes dirty. Returns old id, or -1.
  setBlock(wx, wy, wz, id, meta = 0) {
    if (wy < 0 || wy >= CHUNK_Y) return -1;
    const cx = wx >> 4, cz = wz >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || !c.hasBlocks) return -1;
    const lx = wx & 15, lz = wz & 15;
    const idx = blockIndex(lx, wy, lz);
    const old = c.blocks[idx];
    if (old === id && c.getMeta(lx, wy, lz) === meta) return old;

    c.blocks[idx] = id;
    c.setMeta(lx, wy, lz, meta);
    c.modified = true;
    c.blockEntities.delete(idx);

    if (c.hasLight) {
      lightBlockChange(this, wx, wy, wz, old, id, this.dirtyMeshes);
    }
    this.dirtyMeshes.add(chunkKey(cx, cz));
    if (lx === 0) this.dirtyMeshes.add(chunkKey(cx - 1, cz));
    if (lx === 15) this.dirtyMeshes.add(chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyMeshes.add(chunkKey(cx, cz - 1));
    if (lz === 15) this.dirtyMeshes.add(chunkKey(cx, cz + 1));
    return old;
  }

  blockEntityAt(wx, wy, wz) {
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c) return null;
    return c.blockEntities.get(blockIndex(wx & 15, wy, wz & 15)) ?? null;
  }

  setBlockEntity(wx, wy, wz, data) {
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    if (!c) return;
    const idx = blockIndex(wx & 15, wy, wz & 15);
    if (data === null) c.blockEntities.delete(idx);
    else c.blockEntities.set(idx, data);
    c.modified = true;
  }

  // Terrain height by scanning actual blocks (for spawn / mobs).
  surfaceHeight(wx, wz) {
    for (let y = CHUNK_Y - 1; y >= 0; y--) {
      const id = this.getBlockW(wx, y, wz);
      if (id !== B.AIR && BLOCKS[id].solid) return y;
    }
    return 0;
  }

  biomeMapAt(wx, wz) {
    const c = this.chunks.get(chunkKey(wx >> 4, wz >> 4));
    return c?.biomeMap ? c.biomeMap[(wx & 15) * CHUNK_Z + (wz & 15)] : -1;
  }

  // Chunks whose data changed since last save.
  modifiedChunks() {
    const out = [];
    for (const c of this.chunks.values()) if (c.modified) out.push(c);
    return out;
  }
}
