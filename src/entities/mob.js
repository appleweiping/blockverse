// Mob base class: box-model creatures with simple AI, physics and combat.
// Models are assembled from shaded colored boxes (all original designs).

import * as THREE from 'three';
import { moveEntity, entityInBlock } from '../core/physics.js';
import { B } from '../blocks/blocks.js';

// BoxGeometry with per-face brightness baked into vertex colors, so flat
// MeshBasicMaterial still reads as 3D.
const FACE_SHADE = { px: 0.72, nx: 0.72, py: 1.0, ny: 0.45, pz: 0.86, nz: 0.6 };
function shadedBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const colors = new Float32Array(g.attributes.position.count * 3);
  const order = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  for (let f = 0; f < 6; f++) {
    const s = FACE_SHADE[order[f]];
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = s; colors[i + 1] = s; colors[i + 2] = s;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export class Mob {
  constructor(scene, world, x, y, z) {
    this.scene = scene;
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = 0.7;
    this.h = 1.0;
    this.yaw = Math.random() * Math.PI * 2;
    this.health = 10;
    this.dead = false;
    this.onGround = false;
    this.hurtCooldown = 0;
    this.flashTime = 0;
    this.age = 0;
    this.walkPhase = 0;
    this.moving = false;

    // AI
    this.state = 'idle';
    this.stateTime = 1 + Math.random() * 3;
    this.targetYaw = this.yaw;
    this.speed = 1.6;
    this.fleeSpeed = 3.4;
    this.hostile = false;

    this.group = new THREE.Group();
    this.materials = [];
    this.buildModel();
    scene.add(this.group);
  }

  // subclass hook — assemble boxes into this.group, push materials
  buildModel() {}

  // glow: ignore world light (eyes that stay visible at night)
  part(w, h, d, color, x, y, z, glow = false) {
    const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    const m = new THREE.Mesh(shadedBox(w, h, d), mat);
    m.position.set(x, y, z);
    this.materials.push({ mat, base: new THREE.Color(color), glow });
    this.group.add(m);
    return m;
  }

  update(dt, player) {
    if (this.dead) return;
    this.age += dt;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);

    // despawn far from player
    const pdx = this.x - player.x, pdz = this.z - player.z;
    const playerDistSq = pdx * pdx + pdz * pdz;
    if (playerDistSq > 80 * 80) { this.kill(); return; }
    // freeze in unloaded chunks
    if (!this.world.isLoaded(Math.floor(this.x), Math.floor(this.z))) return;

    this.think(dt, player, Math.sqrt(playerDistSq));

    // steering: turn toward targetYaw, walk forward when moving
    let dyaw = ((this.targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yaw += Math.max(-3 * dt, Math.min(3 * dt, dyaw));

    const inWater = entityInBlock(this.world, this, B.WATER);
    const speed = this.state === 'flee' || this.state === 'chase' ? this.fleeSpeed : this.speed;
    let dvx = 0, dvz = 0;
    if (this.moving) {
      dvx = -Math.sin(this.yaw) * speed;
      dvz = -Math.cos(this.yaw) * speed;
    }
    const accel = this.onGround ? 18 : 5;
    this.vx += (dvx - this.vx) * Math.min(1, accel * dt);
    this.vz += (dvz - this.vz) * Math.min(1, accel * dt);

    if (inWater) {
      this.vy += (1.6 - this.vy) * Math.min(1, 3 * dt); // float up
    } else {
      this.vy -= 26 * dt;
      this.vy = Math.max(this.vy, -40);
    }

    const before = this.y;
    const r = moveEntity(this.world, this, dt);
    this.onGround = r.onGround;
    // hop up single blocks when walking into a wall
    if (r.hitWall && this.onGround && this.moving && !inWater) {
      this.vy = 7.2;
    }

    // fall damage
    if (!this.onGround && this.vy < 0 && !inWater) {
      this.fallStart = Math.max(this.fallStart ?? this.y, this.y);
    } else if ((this.onGround || inWater) && this.fallStart !== undefined) {
      const d = this.fallStart - this.y;
      if (!inWater && d > 4) this.damage(Math.floor(d - 3), null);
      this.fallStart = undefined;
    }

    // animate
    if (this.moving) this.walkPhase += dt * speed * 3.2;
    this.animate(dt);

    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;

    // brightness from voxel light + hurt flash
    const sky = this.world.getSkyW(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const bl = this.world.getBlockLightW(Math.floor(this.x), Math.floor(this.y + 0.5), Math.floor(this.z));
    const day = this.world.materials.uniforms.uDay.value;
    const light = Math.max(0.12, Math.max((sky / 15) * day, bl / 15));
    for (const { mat, base, glow } of this.materials) {
      mat.color.copy(base).multiplyScalar(glow ? 1 : light);
      if (this.flashTime > 0) mat.color.lerp(new THREE.Color(0xff3333), 0.55);
    }
  }

  // default wander AI; subclasses extend
  think(dt, player, playerDist) {
    this.stateTime -= dt;
    if (this.state === 'flee') {
      this.moving = true;
      if (this.stateTime <= 0) { this.state = 'idle'; this.stateTime = 1 + Math.random() * 2; }
    } else if (this.stateTime <= 0) {
      if (this.state === 'idle') {
        this.state = 'wander';
        this.stateTime = 1.5 + Math.random() * 3;
        this.targetYaw = Math.random() * Math.PI * 2;
        this.moving = true;
      } else {
        this.state = 'idle';
        this.stateTime = 1 + Math.random() * 4;
        this.moving = false;
      }
    }
  }

  animate(dt) {
    const swing = Math.sin(this.walkPhase) * (this.moving ? 0.6 : 0);
    if (this.legs) {
      this.legs[0].rotation.x = swing;
      this.legs[1].rotation.x = -swing;
      if (this.legs[2]) this.legs[2].rotation.x = -swing;
      if (this.legs[3]) this.legs[3].rotation.x = swing;
    }
  }

  damage(amount, source) {
    if (this.dead || this.hurtCooldown > 0) return false;
    this.hurtCooldown = 0.45;
    this.health -= amount;
    this.flashTime = 0.25;
    if (source) {
      // knockback away from the attacker
      const dx = this.x - source.x, dz = this.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx += (dx / d) * 6;
      this.vz += (dz / d) * 6;
      this.vy = Math.max(this.vy, 4.5);
      // passive mobs run away
      if (!this.hostile) {
        this.state = 'flee';
        this.stateTime = 4;
        this.targetYaw = Math.atan2(-dx, -dz) + Math.PI;
        this.moving = true;
      }
    }
    if (this.health <= 0) {
      this.die();
      return true;
    }
    return true;
  }

  die() {
    this.onDeath?.();
    this.kill();
  }

  kill() {
    this.dead = true;
    this.scene.remove(this.group);
    for (const { mat } of this.materials) mat.dispose();
  }

  // ray vs this mob's AABB; returns distance or null
  rayHit(origin, dir, maxDist) {
    const hw = this.w / 2;
    const min = { x: this.x - hw, y: this.y, z: this.z - hw };
    const max = { x: this.x + hw, y: this.y + this.h, z: this.z + hw };
    let tmin = 0, tmax = maxDist;
    for (const axis of ['x', 'y', 'z']) {
      const o = origin[axis], d = dir[axis];
      if (Math.abs(d) < 1e-9) {
        if (o < min[axis] || o > max[axis]) return null;
      } else {
        let t1 = (min[axis] - o) / d;
        let t2 = (max[axis] - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }
}
