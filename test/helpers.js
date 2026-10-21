// Build small hand-made worlds for tests: a square of chunks filled by a
// callback, then lit with the real lighting code.

import { CHUNK_X, CHUNK_Y, CHUNK_Z, blockIndex } from '../src/core/constants.js';
import { Chunk, chunkKey } from '../src/world/chunk.js';
import { ChunkStore } from '../src/world/chunkStore.js';
import { initChunkLight } from '../src/world/light.js';

// fill(wx, wy, wz) -> block id. Chunks span cx, cz in [-radius, radius].
export function makeStore(fill, radius = 1) {
  const store = new ChunkStore();
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const blocks = new Uint16Array(CHUNK_X * CHUNK_Y * CHUNK_Z);
      for (let x = 0; x < CHUNK_X; x++) {
        for (let z = 0; z < CHUNK_Z; z++) {
          for (let y = 0; y < CHUNK_Y; y++) {
            blocks[blockIndex(x, y, z)] = fill(cx * 16 + x, y, cz * 16 + z);
          }
        }
      }
      const c = new Chunk(cx, cz);
      c.setData(blocks, new Uint8Array(256), new Uint8Array(256));
      store.chunks.set(chunkKey(cx, cz), c);
    }
  }
  for (const c of store.chunks.values()) initChunkLight(store, c, store.dirtyMeshes);
  store.dirtyMeshes.clear();
  return store;
}
