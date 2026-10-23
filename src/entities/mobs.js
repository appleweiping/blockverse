// Concrete mob types: pig, sheep (passive), murkling (hostile).
// Original box-model designs built from shaded colored parts.

import { Mob } from './mob.js';
import { I } from '../items/itemIds.js';
import { B } from '../blocks/blocks.js';

export class Pig extends Mob {
  constructor(scene, world, x, y, z) {
    super(scene, world, x, y, z);
    this.w = 0.8;
    this.h = 0.9;
    this.health = 10;
    this.kind = 'pig';
  }

  buildModel() {
    const pink = 0xefa2a0, dark = 0xd98886, snoutC = 0xdf8886;
    this.part(0.9, 0.55, 0.6, pink, 0, 0.55, 0);              // body
    const head = this.part(0.45, 0.45, 0.45, pink, 0, 0.72, -0.55); // head
    this.part(0.2, 0.14, 0.08, snoutC, 0, 0.66, -0.8);        // snout
    // eyes
    this.part(0.07, 0.07, 0.02, 0x2a2a2a, -0.12, 0.82, -0.78);
    this.part(0.07, 0.07, 0.02, 0x2a2a2a, 0.12, 0.82, -0.78);
    // legs (pivot at hip: offset geometry down)
    this.legs = [
      this.legPart(dark, -0.25, -0.22),
      this.legPart(dark, 0.25, -0.22),
      this.legPart(dark, -0.25, 0.22),
      this.legPart(dark, 0.25, 0.22),
    ];
    this.head = head;
  }

  legPart(color, x, z) {
    const leg = this.part(0.18, 0.32, 0.18, color, x, 0.32, z);
    leg.geometry = leg.geometry.clone();
    leg.geometry.translate(0, -0.16, 0);
    leg.position.y = 0.32;
    return leg;
  }

  onDeath() {
    this.dropFn?.([{ id: I.PORK_RAW, count: 1 + ((Math.random() * 2) | 0) }]);
  }
}

export class Sheep extends Mob {
  constructor(scene, world, x, y, z) {
    super(scene, world, x, y, z);
    this.w = 0.9;
    this.h = 1.1;
    this.health = 8;
    this.speed = 1.3;
    this.kind = 'sheep';
  }

  buildModel() {
    const wool = 0xe8e6e0, skin = 0xcfae94, legC = 0xbfa088;
    this.part(1.0, 0.7, 0.65, wool, 0, 0.75, 0);              // woolly body
    this.part(0.42, 0.4, 0.4, skin, 0, 1.0, -0.6);            // head
    this.part(0.46, 0.28, 0.2, wool, 0, 1.14, -0.52);         // wool cap
    this.part(0.07, 0.07, 0.02, 0x2a2a2a, -0.11, 1.06, -0.81);
    this.part(0.07, 0.07, 0.02, 0x2a2a2a, 0.11, 1.06, -0.81);
    this.legs = [
      this.legPart(legC, -0.28, -0.22),
      this.legPart(legC, 0.28, -0.22),
      this.legPart(legC, -0.28, 0.22),
      this.legPart(legC, 0.28, 0.22),
    ];
  }

  legPart(color, x, z) {
    const leg = this.part(0.16, 0.45, 0.16, color, x, 0.45, z);
    leg.geometry = leg.geometry.clone();
    leg.geometry.translate(0, -0.22, 0);
    leg.position.y = 0.45;
    return leg;
  }

  onDeath() {
    this.dropFn?.([
      { id: B.WOOL, count: 1 },
      { id: I.MUTTON_RAW, count: 1 + ((Math.random() * 2) | 0) },
    ]);
  }
}

// Murkling: hostile, spawns in the dark. It does not burn in daylight; at
// sunrise it digs itself back into the ground and is gone (no drops).
export class Murkling extends Mob {
  constructor(scene, world, x, y, z) {
    super(scene, world, x, y, z);
    this.w = 0.6;
    this.h = 1.8;
    this.health = 20;
    this.hostile = true;
    this.speed = 1.2;
    this.fleeSpeed = 2.9;   // chase speed
    this.attackCooldown = 0;
    this.burrowT = null;    // seconds spent burrowing, null while active
    this.kind = 'murkling';
  }

  buildModel() {
    const hide = 0x3d3a55, hideD = 0x302d45, headC = 0x4a4466;
    this.part(0.62, 0.86, 0.42, hide, 0, 0.94, 0.04);         // hunched body
    this.part(0.56, 0.42, 0.5, headC, 0, 1.56, -0.08);        // wide head
    this.part(0.11, 0.06, 0.02, 0xe8f27a, -0.13, 1.6, -0.34, true); // eyes glow
    this.part(0.11, 0.06, 0.02, 0xe8f27a, 0.13, 1.6, -0.34, true);
    this.legs = [
      this.limb(hideD, -0.15, 0.5, 0.2, 0.5),
      this.limb(hideD, 0.15, 0.5, 0.2, 0.5),
      // long arms hanging to the knees, swinging with the gait
      this.limb(hideD, -0.4, 1.32, 0.14, 0.86),
      this.limb(hideD, 0.4, 1.32, 0.14, 0.86),
    ];
  }

  // a box hanging from a pivot at (x, top), so rotation.x swings it
  limb(color, x, top, thick, len) {
    const m = this.part(thick, len, thick + 0.04, color, x, top, 0);
    m.geometry = m.geometry.clone();
    m.geometry.translate(0, -len / 2, 0);
    return m;
  }

  update(dt, player) {
    if (this.burrowT === null || this.dead) {
      super.update(dt, player);
      return;
    }
    // sink into the ground, twisting, then vanish
    this.burrowT += dt;
    this.y -= dt * 0.9;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y += dt * 5;
    if (this.burrowT > 2.2) this.kill();
  }

  think(dt, player, playerDist) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // morning: dig in if standing under open sky
    const day = this.world.materials.uniforms.uDay.value;
    const sky = this.world.getSkyW(Math.floor(this.x), Math.floor(this.y + 1.5), Math.floor(this.z));
    if (day > 0.8 && sky >= 13 && this.onGround) {
      this.burrowT = 0;
      this.moving = false;
      return;
    }

    if (!player.dead && playerDist < 18) {
      this.state = 'chase';
      this.moving = true;
      const dx = player.x - this.x, dz = player.z - this.z;
      this.targetYaw = Math.atan2(-dx, -dz);
      // melee
      if (playerDist < 1.4 && this.attackCooldown <= 0) {
        const dy = Math.abs((player.y + 0.9) - (this.y + 1));
        if (dy < 1.6) {
          player.damage(3, 'murkling');
          this.attackCooldown = 1.1;
        }
      }
    } else if (this.state === 'chase') {
      this.state = 'idle';
      this.stateTime = 1;
      this.moving = false;
    } else {
      super.think(dt, player, playerDist);
    }
  }

  onDeath() {
    this.dropFn?.([{ id: I.MURK_JELLY, count: 1 + ((Math.random() * 2) | 0) }]);
  }
}
