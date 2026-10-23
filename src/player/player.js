// Player: first-person movement, physics, survival stats, inventory.

import {
  PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE, GRAVITY, JUMP_SPEED,
  WALK_SPEED, SPRINT_SPEED, SNEAK_SPEED, FLY_SPEED, SWIM_SPEED,
  GAMEMODE_SURVIVAL, GAMEMODE_CREATIVE, CHUNK_Y,
} from '../core/constants.js';
import { moveEntity, entityInBlock, pointInWater } from '../core/physics.js';
import { B } from '../blocks/blocks.js';
import { liftAt, LIFT_SPEED, GLIDE_FALL } from '../world/wind.js';
import { itemInfo, makeStack, mergeStack, maxStack } from '../items/items.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 8; this.y = 80; this.z = 8;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.w = PLAYER_WIDTH;
    this.h = PLAYER_HEIGHT;
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.inWater = false;
    this.headInWater = false;
    this.lift = 0;            // 0..1 while inside a wind vent's column
    this.windborne = false;   // lifted by a vent and not landed yet: glide, no fall damage
    this.mode = GAMEMODE_SURVIVAL;

    // survival stats
    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.air = 20;
    this.dead = false;
    this.fallStart = null;
    this.hurtCooldown = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.airTimer = 0;
    this.exhaustion = 0;

    // inventory: 36 slots (0-8 hotbar), stacks are {id, count, dur?} | null
    this.inventory = new Array(36).fill(null);
    this.selected = 0;

    this.spawnPoint = { x: 8, y: 80, z: 8 };

    // double-tap space tracking for fly toggle
    this._lastSpace = -1;

    this.events = new EventTarget();
  }

  get eyeY() {
    return this.y + (this.sneaking ? PLAYER_EYE - 0.15 : PLAYER_EYE);
  }

  heldStack() {
    return this.inventory[this.selected];
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  update(input, dt, paused) {
    if (this.dead) return;
    // Freeze physics until the chunk under the player has real blocks —
    // unloaded chunks read as solid and would eject the player skyward.
    if (!this.world.isLoaded(Math.floor(this.x), Math.floor(this.z))) return;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);

    // look
    if (!paused) {
      const sens = 0.0023 * (this.sensitivity ?? 1);
      this.yaw -= input.dx * sens;
      this.pitch -= input.dy * sens;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    }

    this.inWater = entityInBlock(this.world, this, B.WATER);
    this.headInWater = pointInWater(this.world, this.x, this.eyeY, this.z);

    // movement intent
    let fwd = 0, strafe = 0;
    if (!paused) {
      if (input.down('KeyW')) fwd += 1;
      if (input.down('KeyS')) fwd -= 1;
      if (input.down('KeyD')) strafe += 1;
      if (input.down('KeyA')) strafe -= 1;
    }
    this.sneaking = !paused && input.down('ShiftLeft') && !this.flying;
    this.sprinting = !paused && input.down('ControlLeft') && fwd > 0 && !this.sneaking && this.hunger > 6;

    const creative = this.mode === GAMEMODE_CREATIVE;
    if (!creative) this.flying = false;

    let speed = this.flying ? FLY_SPEED :
      this.inWater ? SWIM_SPEED :
      this.sneaking ? SNEAK_SPEED :
      this.sprinting ? SPRINT_SPEED : WALK_SPEED;

    // desired horizontal velocity in world space
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dvx = (-sin * fwd + cos * strafe);
    let dvz = (-cos * fwd - sin * strafe);
    const len = Math.hypot(dvx, dvz);
    if (len > 0) { dvx = (dvx / len) * speed; dvz = (dvz / len) * speed; }

    // acceleration: snappy on ground, floatier in air/water
    const accel = this.flying ? 24 : this.onGround ? 40 : this.inWater ? 12 : 8;
    this.vx += (dvx - this.vx) * Math.min(1, accel * dt);
    this.vz += (dvz - this.vz) * Math.min(1, accel * dt);

    if (this.flying) {
      let vy = 0;
      if (!paused && input.down('Space')) vy += FLY_SPEED;
      if (!paused && input.down('ShiftLeft')) vy -= FLY_SPEED;
      this.vy += (vy - this.vy) * Math.min(1, 24 * dt);
    } else if (this.inWater) {
      this.vy -= GRAVITY * 0.25 * dt;
      this.vy = Math.max(this.vy, -3.5);
      if (!paused && input.down('Space')) this.vy = Math.min(this.vy + 24 * dt, 3.2);
    } else {
      this.lift = liftAt(this.world, this.x, this.y + 0.1, this.z);
      if (this.lift > 0) {
        // ride the column up; sneak to sink back down it
        const target = this.sneaking ? -2.5 : LIFT_SPEED;
        this.vy += (target - this.vy) * Math.min(1, 6 * dt) * this.lift;
        this.vy -= GRAVITY * dt * (1 - this.lift);
        // the column keeps you near its middle unless you walk out
        this.vx += (Math.floor(this.x) + 0.5 - this.x) * 5 * dt;
        this.vz += (Math.floor(this.z) + 0.5 - this.z) * 5 * dt;
        this.windborne = true;
      } else {
        this.vy -= GRAVITY * dt;
        this.vy = Math.max(this.vy, this.windborne ? -GLIDE_FALL : -60);
        if (!paused && input.down('Space') && this.onGround) {
          this.vy = JUMP_SPEED;
          this.addExhaustion(this.sprinting ? 0.2 : 0.05);
        }
      }
    }

    // integrate with collision (substep for high speeds)
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vy, this.vz) * dt) / 0.4));
    let onGround = false;
    for (let i = 0; i < steps; i++) {
      const r = moveEntity(this.world, this, dt / steps, this.sneaking);
      onGround = onGround || r.onGround;
    }
    this.onGround = onGround;
    if ((this.onGround && this.lift === 0) || this.inWater || this.flying) this.windborne = false;

    // fall damage tracking (none while gliding down from a wind column)
    if (!creative && !this.flying && !this.windborne) {
      if (!this.onGround && !this.inWater && this.vy < 0) {
        if (this.fallStart === null) this.fallStart = this.y + Math.abs(this.vy * dt); // approx
        // fallStart records highest point; keep max
        this.fallStart = Math.max(this.fallStart, this.y - this.vy * dt);
      }
      if ((this.onGround || this.inWater) && this.fallStart !== null) {
        const fallDist = this.fallStart - this.y;
        if (!this.inWater && fallDist > 3.2) {
          this.damage(Math.floor(fallDist - 3), 'fall');
        }
        this.fallStart = null;
      }
    } else {
      this.fallStart = null;
    }

    if (this.y < -12) this.damage(4, 'void');

    if (!creative) this.updateSurvival(dt);

    // sprint exhaustion
    if (this.sprinting) this.addExhaustion(0.1 * dt * 7);
  }

  tapSpace(now) {
    if (this.mode !== GAMEMODE_CREATIVE) return;
    if (now - this._lastSpace < 300) {
      this.flying = !this.flying;
      this.vy = 0;
      this._lastSpace = -1;
    } else {
      this._lastSpace = now;
    }
  }

  updateSurvival(dt) {
    // exhaustion -> saturation -> hunger
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }

    // regen / starve
    if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 2.5) {
        this.regenTimer = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.addExhaustion(1.5);
      }
    } else if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 3) {
        this.starveTimer = 0;
        if (this.health > 2) this.damage(1, 'starve');
      }
    } else {
      this.regenTimer = 0;
    }

    // drowning
    if (this.headInWater) {
      this.airTimer += dt;
      if (this.airTimer >= 0.75) {
        this.airTimer = 0;
        if (this.air > 0) this.air--;
        else this.damage(2, 'drown');
      }
    } else {
      this.air = Math.min(20, this.air + dt * 8);
      this.airTimer = 0;
    }
  }

  addExhaustion(v) {
    if (this.mode === GAMEMODE_SURVIVAL) this.exhaustion += v;
  }

  damage(amount, cause = 'generic') {
    if (this.dead || this.mode === GAMEMODE_CREATIVE) return;
    if (this.hurtCooldown > 0) return;
    this.hurtCooldown = 0.5;
    this.health -= amount;
    this.events.dispatchEvent(new CustomEvent('hurt', { detail: { amount, cause } }));
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.events.dispatchEvent(new CustomEvent('death', { detail: { cause } }));
    }
  }

  eat(foodValue) {
    this.hunger = Math.min(20, this.hunger + foodValue);
    this.saturation = Math.min(this.hunger, this.saturation + foodValue * 0.6);
  }

  respawn() {
    this.x = this.spawnPoint.x;
    this.y = this.spawnPoint.y;
    this.z = this.spawnPoint.z;
    this.vx = this.vy = this.vz = 0;
    this.health = this.maxHealth;
    this.hunger = 20;
    this.saturation = 5;
    this.air = 20;
    this.dead = false;
    this.fallStart = null;
  }

  // ---- inventory helpers ----

  // Add a stack to the inventory (hotbar first). Returns leftover count.
  give(id, count = 1) {
    let remaining = count;
    const info = itemInfo(id);
    if (!info) return count;
    // merge into existing stacks (non-tools only)
    if (!info.tool) {
      for (let i = 0; i < 36 && remaining > 0; i++) {
        const s = this.inventory[i];
        if (s && s.id === id && s.dur === undefined) {
          const room = maxStack(id) - s.count;
          const take = Math.min(room, remaining);
          s.count += take;
          remaining -= take;
        }
      }
    }
    // fill empty slots
    for (let i = 0; i < 36 && remaining > 0; i++) {
      if (!this.inventory[i]) {
        const take = Math.min(maxStack(id), remaining);
        this.inventory[i] = makeStack(id, take);
        remaining -= take;
      }
    }
    if (remaining !== count) this.events.dispatchEvent(new CustomEvent('inventory'));
    return remaining;
  }

  // Remove `count` items of id. Returns how many were removed.
  take(id, count = 1) {
    let removed = 0;
    for (let i = 35; i >= 0 && removed < count; i--) {
      const s = this.inventory[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, count - removed);
        s.count -= take;
        removed += take;
        if (s.count <= 0) this.inventory[i] = null;
      }
    }
    if (removed > 0) this.events.dispatchEvent(new CustomEvent('inventory'));
    return removed;
  }

  countOf(id) {
    let n = 0;
    for (const s of this.inventory) if (s && s.id === id) n += s.count;
    return n;
  }

  consumeHeld(n = 1) {
    const s = this.inventory[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.inventory[this.selected] = null;
    this.events.dispatchEvent(new CustomEvent('inventory'));
  }

  damageHeldTool(n = 1) {
    const s = this.inventory[this.selected];
    if (!s || s.dur === undefined) return;
    s.dur -= n;
    if (s.dur <= 0) {
      this.inventory[this.selected] = null;
      this.events.dispatchEvent(new CustomEvent('toolbreak'));
    }
    this.events.dispatchEvent(new CustomEvent('inventory'));
  }

  serialize() {
    return {
      x: this.x, y: this.y, z: this.z,
      yaw: this.yaw, pitch: this.pitch,
      health: this.health, hunger: this.hunger, saturation: this.saturation, air: this.air,
      mode: this.mode, flying: this.flying,
      inventory: this.inventory,
      selected: this.selected,
      spawnPoint: this.spawnPoint,
    };
  }

  deserialize(d) {
    if (!d) return;
    Object.assign(this, {
      x: d.x, y: d.y, z: d.z, yaw: d.yaw ?? 0, pitch: d.pitch ?? 0,
      health: d.health ?? 20, hunger: d.hunger ?? 20, saturation: d.saturation ?? 5,
      air: d.air ?? 20, mode: d.mode ?? GAMEMODE_SURVIVAL, flying: d.flying ?? false,
      selected: d.selected ?? 0,
    });
    if (Array.isArray(d.inventory)) this.inventory = d.inventory.map((s) => (s ? { ...s } : null));
    if (d.spawnPoint) this.spawnPoint = { ...d.spawnPoint };
    this.dead = this.health <= 0;
  }
}
