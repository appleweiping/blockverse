// World: streams chunks around the player, schedules light initialization
// and mesh building. Block access lives in ChunkStore.

import * as THREE from 'three';
import { CHUNK_X, CHUNK_Y, CHUNK_Z } from '../core/constants.js';
import { Chunk, chunkKey } from './chunk.js';
import { ChunkStore } from './chunkStore.js';
import { GenPool } from './genPool.js';
import { WorldGen } from './worldgen.js';
import { initChunkLight } from './light.js';
import { buildChunkGeometry } from '../render/mesher.js';
import { createChunkMaterials } from '../render/chunkMaterial.js';

export class World extends ChunkStore {
  constructor({ seed, atlas, renderDistance = 8, loadChunk = null, onChunkEvicted = null }) {
    super();
    this.seed = seed;
    this.atlas = atlas;
    this.renderDistance = renderDistance;
    this.loadChunk = loadChunk;           // async (cx, cz) => {blocks, meta, blockEntities}|null
    this.onChunkEvicted = onChunkEvicted; // (chunk) => void  (save hook)

    this.gen = new WorldGen(seed);        // main-thread copy for queries (spawn, biome)
    this.pool = new GenPool(seed);
    this.pendingGen = new Set();
    this.lightQueue = [];                 // chunks with blocks, awaiting light
    this.materials = createChunkMaterials(atlas);
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.centerCx = Infinity;
    this.centerCz = Infinity;
    this.stats = { chunks: 0, meshed: 0, genQueue: 0 };
  }

  biomeAt(wx, wz) {
    const b = this.biomeMapAt(wx, wz);
    return b >= 0 ? b : this.gen.biomeAt(wx, wz);
  }

  // ---- streaming ----
  // budgetScale > 1 lets background/hidden ticks do more work per call.
  update(px, pz, frameStart, budgetScale = 1) {
    const lightBudget = 5 * budgetScale;
    const meshBudget = 9 * budgetScale;
    const pcx = Math.floor(px / CHUNK_X);
    const pcz = Math.floor(pz / CHUNK_Z);
    const R = this.renderDistance;

    if (pcx !== this.centerCx || pcz !== this.centerCz) {
      this.centerCx = pcx;
      this.centerCz = pcz;
      this.requestMissing(pcx, pcz, R + 1);
      this.evictFar(pcx, pcz, R + 3);
      this.pool.prune((cx, cz) => Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) <= R + 1);
    }

    // light init: budgeted
    let guard = 0;
    while (this.lightQueue.length && performance.now() - frameStart < lightBudget && guard++ < 4 * budgetScale) {
      // nearest first
      this.lightQueue.sort((a, b) =>
        (Math.abs(b.cx - pcx) + Math.abs(b.cz - pcz)) - (Math.abs(a.cx - pcx) + Math.abs(a.cz - pcz)));
      const c = this.lightQueue.pop();
      if (!c.hasBlocks || c.hasLight) continue;
      initChunkLight(this, c, this.dirtyMeshes);
    }

    // mesh rebuilds: nearest dirty chunks first, budgeted
    if (this.dirtyMeshes.size) {
      const list = [...this.dirtyMeshes]
        .map((key) => this.chunks.get(key))
        .filter((c) => c && c.hasLight && this.neighborsLit(c) &&
          Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) <= R)
        .sort((a, b) =>
          (Math.abs(a.cx - pcx) + Math.abs(a.cz - pcz)) - (Math.abs(b.cx - pcx) + Math.abs(b.cz - pcz)));
      for (const c of list) {
        this.rebuildMesh(c);
        this.dirtyMeshes.delete(chunkKey(c.cx, c.cz));
        if (performance.now() - frameStart > meshBudget) break;
      }
    }

    this.stats.chunks = this.chunks.size;
    this.stats.genQueue = this.pool.queue.length + this.pendingGen.size;
  }

  neighborsLit(chunk) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const n = this.getChunk(chunk.cx + dx, chunk.cz + dz);
        if (!n || !n.hasLight) return false;
      }
    }
    return true;
  }

  requestMissing(pcx, pcz, radius) {
    const wanted = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key) || this.pendingGen.has(key)) continue;
        wanted.push([cx, cz, dx * dx + dz * dz]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of wanted) this.requestChunk(cx, cz);
  }

  async requestChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    this.pendingGen.add(key);
    try {
      // Saved data takes precedence over fresh generation.
      let saved = null;
      if (this.loadChunk) saved = await this.loadChunk(cx, cz);

      let blocks, heightMap, biomeMap;
      if (saved) {
        blocks = saved.blocks;
        heightMap = new Uint8Array(CHUNK_X * CHUNK_Z);
        biomeMap = new Uint8Array(CHUNK_X * CHUNK_Z);
        for (let x = 0; x < CHUNK_X; x++) {
          for (let z = 0; z < CHUNK_Z; z++) {
            const wx = cx * CHUNK_X + x, wz = cz * CHUNK_Z + z;
            heightMap[x * CHUNK_Z + z] = Math.floor(this.gen.heightAt(wx, wz));
            biomeMap[x * CHUNK_Z + z] = this.gen.biomeAt(wx, wz);
          }
        }
      } else {
        const res = await this.pool.generate(cx, cz);
        blocks = res.blocks;
        heightMap = res.heightMap;
        biomeMap = res.biomeMap;
      }

      if (!this.pendingGen.has(key)) return; // world disposed meanwhile
      const chunk = new Chunk(cx, cz);
      chunk.setData(blocks, heightMap, biomeMap);
      if (saved?.meta) chunk.meta = saved.meta;
      if (saved?.blockEntities) {
        for (const [idx, data] of saved.blockEntities) chunk.blockEntities.set(idx, data);
      }
      if (saved) chunk.modified = true; // keep persisting on evict
      this.chunks.set(key, chunk);
      this.lightQueue.push(chunk);
      // neighbors may now be meshable / need border remesh
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const n = this.getChunk(cx + dx, cz + dz);
          if (n?.mesh || n?.hasLight) this.dirtyMeshes.add(chunkKey(cx + dx, cz + dz));
        }
      }
    } finally {
      this.pendingGen.delete(key);
    }
  }

  evictFar(pcx, pcz, maxDist) {
    for (const [key, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > maxDist) {
        if (c.modified && this.onChunkEvicted) this.onChunkEvicted(c);
        this.disposeChunkMesh(c);
        this.chunks.delete(key);
        this.dirtyMeshes.delete(key);
      }
    }
  }

  rebuildMesh(chunk) {
    this.disposeChunkMesh(chunk);
    const { opaqueGeo, waterGeo } = buildChunkGeometry(this, chunk, this.atlas);
    const mesh = { opaque: null, water: null };
    const sphere = new THREE.Sphere(
      new THREE.Vector3(chunk.cx * CHUNK_X + 8, CHUNK_Y / 2, chunk.cz * CHUNK_Z + 8),
      Math.sqrt(8 * 8 + (CHUNK_Y / 2) * (CHUNK_Y / 2) + 8 * 8) + 1);
    if (opaqueGeo) {
      opaqueGeo.boundingSphere = sphere.clone();
      mesh.opaque = new THREE.Mesh(opaqueGeo, this.materials.opaque);
      mesh.opaque.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
      mesh.opaque.updateMatrix();
      mesh.opaque.matrixAutoUpdate = false;
      this.group.add(mesh.opaque);
    }
    if (waterGeo) {
      waterGeo.boundingSphere = sphere.clone();
      mesh.water = new THREE.Mesh(waterGeo, this.materials.water);
      mesh.water.position.set(chunk.cx * CHUNK_X, 0, chunk.cz * CHUNK_Z);
      mesh.water.updateMatrix();
      mesh.water.matrixAutoUpdate = false;
      mesh.water.renderOrder = 10;
      this.group.add(mesh.water);
    }
    chunk.mesh = mesh;
    this.stats.meshed++;
  }

  disposeChunkMesh(chunk) {
    if (!chunk.mesh) return;
    for (const m of [chunk.mesh.opaque, chunk.mesh.water]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    chunk.mesh = null;
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeChunkMesh(c);
    this.chunks.clear();
    this.pendingGen.clear();
    this.pool.dispose();
    this.materials.opaque.dispose();
    this.materials.water.dispose();
  }
}
