// Dropped item entities: mini cubes (blocks) or flat sprites (items) that
// bob, spin, fall with gravity, and fly to the player on pickup range.

import * as THREE from 'three';
import { moveEntity } from '../core/physics.js';
import { liftAt, LIFT_SPEED } from '../world/wind.js';
import { isBlockItem, itemInfo } from '../items/items.js';
import { blockInfo, R_CROSS, R_TORCH } from '../blocks/blocks.js';
import { generateTile } from '../render/textures.js';

const texCache = new Map();
function itemTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  let tileName;
  if (isBlockItem(id)) {
    const b = blockInfo(id);
    const t = b.textures;
    tileName = typeof t === 'string' ? t : (b.render === R_CROSS || b.render === R_TORCH ? t.side ?? t : t.side);
    if (typeof tileName !== 'string') tileName = typeof t === 'object' ? (t.side ?? t.top) : t;
  } else {
    tileName = itemInfo(id)?.texture;
  }
  const tex = new THREE.CanvasTexture(generateTile(tileName));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(id, tex);
  return tex;
}

const geoCube = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const geoFlat = new THREE.PlaneGeometry(0.35, 0.35);

export class ItemDrop {
  constructor(scene, world, id, count, x, y, z, vx = 0, vy = 2.5, vz = 0) {
    this.world = world;
    this.id = id;
    this.count = count;
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.w = 0.25;
    this.h = 0.25;
    this.age = 0;
    this.pickupDelay = 0.6;
    this.dead = false;

    const isBlock = isBlockItem(id) && blockInfo(id).render !== R_CROSS && blockInfo(id).render !== R_TORCH;
    const mat = new THREE.MeshBasicMaterial({
      map: itemTexture(id),
      transparent: true,
      alphaTest: 0.1,
      side: isBlock ? THREE.FrontSide : THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(isBlock ? geoCube : geoFlat, mat);
    this.spin = Math.random() * Math.PI * 2;
    scene.add(this.mesh);
    this.scene = scene;
  }

  update(dt, player) {
    this.age += dt;
    this.pickupDelay = Math.max(0, this.pickupDelay - dt);
    if (this.age > 300) { this.kill(); return; }

    // gravity (or a wind vent's lift) + collision
    const lift = liftAt(this.world, this.x, this.y, this.z);
    this.vy += (LIFT_SPEED * 0.7 - this.vy) * Math.min(1, 4 * dt) * lift;
    this.vy -= 22 * dt * (1 - lift);
    this.vy = Math.max(this.vy, -30);
    this.vx *= (1 - Math.min(1, 6 * dt));
    this.vz *= (1 - Math.min(1, 6 * dt));
    moveEntity(this.world, this, dt);

    // magnet + pickup
    if (this.pickupDelay <= 0 && !player.dead) {
      const dx = player.x - this.x;
      const dy = (player.y + 0.9) - this.y;
      const dz = player.z - this.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 1.1) {
        const leftover = player.give(this.id, this.count);
        if (leftover === 0) {
          this.kill();
          this.pickedUp = true;
          return;
        }
        this.count = leftover;
      } else if (distSq < 6.5) {
        const d = Math.sqrt(distSq);
        const pull = 5.5 / Math.max(0.4, d);
        this.vx += (dx / d) * pull * dt * 10;
        this.vy += (dy / d) * pull * dt * 10;
        this.vz += (dz / d) * pull * dt * 10;
      }
    }

    // visuals
    this.spin += dt * 1.8;
    const bob = Math.sin(this.age * 2.2) * 0.045;
    this.mesh.position.set(this.x, this.y + 0.18 + bob, this.z);
    this.mesh.rotation.y = this.spin;
  }

  kill() {
    this.dead = true;
    this.scene.remove(this.mesh);
    this.mesh.material.dispose();
  }
}
