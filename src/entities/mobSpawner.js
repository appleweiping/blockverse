// Runtime mob spawning and despawning around the player.

import { Pig, Sheep, Murkling } from './mobs.js';
import { B, isSolid } from '../blocks/blocks.js';
import { BIOME } from '../world/worldgen.js';

const PASSIVE_CAP = 10;
const HOSTILE_CAP = 8;

export class MobSpawner {
  constructor(scene, world, entities) {
    this.scene = scene;
    this.world = world;
    this.entities = entities;
    this.timer = 0;
  }

  update(dt, player, dayFactor) {
    this.timer += dt;
    if (this.timer < 2) return;
    this.timer = 0;

    const mobs = this.entities.mobs;
    const passives = mobs.filter((m) => !m.hostile).length;
    const hostiles = mobs.filter((m) => m.hostile).length;

    if (passives < PASSIVE_CAP) this.trySpawn(player, false, dayFactor);
    if (hostiles < HOSTILE_CAP && dayFactor < 0.4) this.trySpawn(player, true, dayFactor);
  }

  trySpawn(player, hostile, dayFactor) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 24;
      const wx = Math.floor(player.x + Math.cos(angle) * dist);
      const wz = Math.floor(player.z + Math.sin(angle) * dist);
      if (!this.world.isLoaded(wx, wz)) continue;

      const y = this.world.surfaceHeight(wx, wz) + 1;
      if (y <= 1 || y > 120) continue;
      const ground = this.world.getBlockW(wx, y - 1, wz);
      if (!isSolid(ground) || ground === B.WATER) continue;
      // need 2 blocks of air
      if (this.world.getBlockW(wx, y, wz) !== B.AIR || this.world.getBlockW(wx, y + 1, wz) !== B.AIR) continue;

      if (hostile) {
        // hostiles need darkness
        const sky = this.world.getSkyW(wx, y, wz);
        const bl = this.world.getBlockLightW(wx, y, wz);
        const light = Math.max((sky / 15) * dayFactor * 15, bl);
        if (light > 7) continue;
        this.spawnMob(Murkling, wx + 0.5, y, wz + 0.5);
        return;
      }

      // passives prefer grassy biomes
      const biome = this.world.biomeAt(wx, wz);
      if (![BIOME.PLAINS, BIOME.FOREST, BIOME.BIRCH_FOREST, BIOME.SWAMP, BIOME.MOUNTAINS].includes(biome)) continue;
      if (ground !== B.GRASS && ground !== B.SNOWY_GRASS && ground !== B.DIRT) continue;
      this.spawnMob(Math.random() < 0.5 ? Pig : Sheep, wx + 0.5, y, wz + 0.5);
      return;
    }
  }

  spawnMob(Cls, x, y, z) {
    const mob = new Cls(this.scene, this.world, x, y, z);
    mob.dropFn = (drops) => this.entities.spawnDrops(mob.x, mob.y + 0.4, mob.z, drops);
    this.entities.addMob(mob);
    return mob;
  }
}
