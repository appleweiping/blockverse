// Game: wires the world, player, entities, UI and render loop together.

import * as THREE from 'three';
import { World } from './world/world.js';
import { Player } from './player/player.js';
import { Interaction } from './player/interaction.js';
import { Input } from './core/input.js';
import { BlockHighlight } from './render/highlight.js';
import { EntityManager } from './entities/entityManager.js';
import { Hud } from './ui/hud.js';
import { Sky } from './render/sky.js';
import { Containers } from './ui/containers.js';
import { tickFurnaces } from './items/furnace.js';
import { MobSpawner } from './entities/mobSpawner.js';
import { itemInfo } from './items/items.js';
import { REACH_DISTANCE } from './core/constants.js';
import { Chat } from './ui/chat.js';
import { blockInfo } from './blocks/blocks.js';
import { BIOME_NAMES } from './world/worldgen.js';
import { DAY_LENGTH_SECONDS, GAMEMODE_CREATIVE, GAMEMODE_SURVIVAL, SEA_LEVEL } from './core/constants.js';
import { B } from './blocks/blocks.js';

export class Game {
  constructor({ canvas, atlas, worldMeta, store = null, sfx = null, onExit = null }) {
    this.canvas = canvas;
    this.atlas = atlas;
    this.worldMeta = worldMeta;
    this.store = store;
    this.sfx = sfx;
    this.onExit = onExit;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fbcec);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 800);

    this.world = new World({
      seed: worldMeta.seed,
      atlas,
      renderDistance: worldMeta.renderDistance ?? 8,
      loadChunk: store ? (cx, cz) => store.loadChunk(worldMeta.id, cx, cz) : null,
      onChunkEvicted: store ? (c) => { store.saveChunk(worldMeta.id, c); c.modified = false; } : null,
    });
    this.scene.add(this.world.group);

    this.player = new Player(this.world);
    this.player.mode = worldMeta.mode ?? GAMEMODE_SURVIVAL;

    this.entities = new EntityManager(this.scene, this.world);
    this.entities.onPickup = () => this.sfx?.play('pickup');

    this.input = new Input(canvas);
    this.highlight = new BlockHighlight(this.scene);

    this.interaction = new Interaction(this.world, this.player, {
      spawnDrops: (x, y, z, drops) => this.entities.spawnDrops(x, y, z, drops),
      openUI: (kind, pos) => {
        if (kind === 'crafting') this.containers.openCrafting();
        else if (kind === 'furnace') this.containers.openFurnace(pos);
      },
      playSound: (name, opts) => this.sfx?.play(name, opts),
    });

    this.hud = new Hud(atlas, this.player);
    this.sky = new Sky(this.scene, this.world.materials.uniforms);
    this.containers = new Containers(this);
    this._furnaceUiTimer = 0;
    this.mobSpawner = new MobSpawner(this.scene, this.world, this.entities);
    this.chat = new Chat(this);
    this._stepDistance = 0;
    canvas.addEventListener('mousedown', () => this.sfx?.resume());

    // attack mobs on left click (takes priority over starting to mine)
    this.input.onMouseDown = (button) => {
      if (button !== 0 || this.uiOpen || this.player.dead) return;
      const origin = { x: this.player.x, y: this.player.eyeY, z: this.player.z };
      const dir = this.player.lookDir();
      let best = null, bestDist = Infinity;
      for (const m of this.entities.mobs) {
        const d = m.rayHit(origin, dir, REACH_DISTANCE);
        if (d !== null && d < bestDist) { best = m; bestDist = d; }
      }
      // don't attack through walls
      if (best && (!this.interaction.target || bestDist < this.interaction.target.dist)) {
        const held = this.player.heldStack();
        const dmg = held ? itemInfo(held.id)?.tool?.damage ?? 1 : 1;
        if (best.damage(dmg, this.player)) {
          this.sfx?.play('hit', { block: 'cloth' });
          this.player.damageHeldTool(1);
          this.player.addExhaustion(0.1);
          this.interaction.breakCooldown = 0.3;
          this.interaction.resetBreaking();
        }
      }
    };

    this.time = worldMeta.timeOfDay ?? 0.05; // fraction of a day; 0 = sunrise
    this.paused = false;
    this.uiOpen = false;
    this.uiHooks = null;   // set by ui/screens module
    this.running = false;
    this.statTimer = 0;
    this.autosaveTimer = 0;
    this.fps = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;

    this.player.events.addEventListener('hurt', () => {
      this.sfx?.play('hurt');
      this.hud.renderStats();
      this.flashDamage();
    });
    this.player.events.addEventListener('death', () => {
      this.uiHooks?.showDeath?.();
    });

    this._onResize = () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);

    this.bindKeys();
    this.setupSpawn();

    // hidden-tab ticker (page timers are throttled; a worker's are not)
    this.ticker = new Worker(URL.createObjectURL(new Blob(
      ['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' })));
    this.ticker.onmessage = () => { if (document.hidden && this.running) this.loop(); };
    this._onVisibility = () => { if (!document.hidden && this.running) requestAnimationFrame(this._loopBound); };
    document.addEventListener('visibilitychange', this._onVisibility);
    this._loopBound = () => this.loop();
  }

  setupSpawn() {
    const saved = this.worldMeta.playerData;
    if (saved) {
      this.player.deserialize(saved);
      return;
    }
    // find a dry spawn column near origin
    const gen = this.world.gen;
    let sx = 8, sz = 8;
    for (let r = 0; r < 40; r++) {
      const x = 8 + ((r * 13) % 160) - 80;
      const z = 8 + ((r * 29) % 160) - 80;
      if (gen.heightAt(x, z) > SEA_LEVEL + 1) { sx = x; sz = z; break; }
    }
    const sy = Math.floor(gen.heightAt(sx, sz)) + 2;
    this.player.x = sx + 0.5; this.player.y = sy; this.player.z = sz + 0.5;
    this.player.spawnPoint = { x: sx + 0.5, y: sy + 1, z: sz + 0.5 };
  }

  bindKeys() {
    this.input.onKeyDown = (code, e) => {
      if (this.uiHooks?.handleKey?.(code, e)) return true;

      if (code === 'KeyE' || (code === 'Escape' && this.containers.isOpen())) {
        if (this.containers.isOpen()) this.containers.close();
        else if (code === 'KeyE' && !this.uiOpen && !this.player.dead) this.containers.openInventory();
        return true;
      }
      if (code === 'Escape' && !this.uiOpen && !this.player.dead) {
        this.uiHooks?.showPause?.();
        return true;
      }
      if ((code === 'KeyT' || code === 'Slash') && !this.uiOpen && !this.player.dead) {
        this.chat.show(code === 'Slash' ? '/' : '');
        return true;
      }
      if (this.uiOpen) return false;

      if (code.startsWith('Digit')) {
        const n = parseInt(code.slice(5), 10);
        if (n >= 1 && n <= 9) {
          this.player.selected = n - 1;
          this.hud.renderHotbar();
          return true;
        }
      }
      switch (code) {
        case 'Backquote':
          this.hud.toggleDebug();
          return true;
        case 'Space':
          this.player.tapSpace(performance.now());
          return false;
        case 'KeyQ': {
          const s = this.player.heldStack();
          if (s) {
            const dir = this.player.lookDir();
            this.entities.spawnDrops(
              this.player.x + dir.x, this.player.eyeY - 0.3, this.player.z + dir.z,
              [{ id: s.id, count: 1 }]);
            this.player.consumeHeld(1);
          }
          return true;
        }
      }
      return false;
    };

    this.input.onWheel = (dir) => {
      if (this.uiOpen) return;
      this.player.selected = (this.player.selected + dir + 9) % 9;
      this.hud.renderHotbar();
    };

    this.input.onLockLost = () => {
      if (!this.uiOpen && this.running) this.uiHooks?.showPause?.();
    };
  }

  setUiOpen(open) {
    this.uiOpen = open;
    this.input.captured = open;
    if (open) this.input.releaseLock();
  }

  flashDamage() {
    this.canvas.style.transition = 'none';
    this.canvas.style.filter = 'sepia(0.4) hue-rotate(-30deg) saturate(2.5)';
    setTimeout(() => {
      this.canvas.style.transition = 'filter 0.3s';
      this.canvas.style.filter = 'none';
    }, 90);
  }

  // Day factor: 1 at noon, 0 at night, smooth transitions at dawn/dusk.
  dayFactor() {
    const t = this.time % 1;
    // sun elevation: sin over the day half
    const el = Math.sin(t * Math.PI * 2);
    return Math.max(0.03, Math.min(1, 0.5 + el * 2.2));
  }

  start() {
    this.running = true;
    this.hud.show();
    this.last = performance.now();
    requestAnimationFrame(this._loopBound);
  }

  loop() {
    if (!this.running) return;
    if (!document.hidden) requestAnimationFrame(this._loopBound);

    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    this._fpsFrames++;
    this._fpsTime += (now - (this._lastReal ?? now)) / 1000;
    this._lastReal = now;
    if (this._fpsTime >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsFrames = 0; this._fpsTime = 0;
    }

    const gamePaused = this.paused || this.uiOpen;

    this.time = (this.time + dt / DAY_LENGTH_SECONDS) % 1;
    const day = this.dayFactor();
    this.world.materials.uniforms.uDay.value = day;

    // fog follows render distance
    const R = this.world.renderDistance * 16;
    this.world.materials.uniforms.uFogNear.value = R * 0.6;
    this.world.materials.uniforms.uFogFar.value = R * 0.95;
    this.sky.update(this.time, day, this.player, this.player.headInWater);

    if (!gamePaused || document.hidden) {
      const wasInWater = this.player.inWater;
      const px0 = this.player.x, pz0 = this.player.z;
      this.player.update(this.input, dt, gamePaused);
      this.interaction.update(this.input, dt, gamePaused);
      this.entities.update(dt, this.player);
      this.mobSpawner.update(dt, this.player, day);
      this.tickBlockEntities(dt);

      // footsteps + splash
      if (this.player.onGround && !this.player.flying) {
        this._stepDistance += Math.hypot(this.player.x - px0, this.player.z - pz0);
        if (this._stepDistance > 2.1) {
          this._stepDistance = 0;
          const ground = blockInfo(this.world.getBlockW(
            Math.floor(this.player.x), Math.floor(this.player.y) - 1, Math.floor(this.player.z)));
          if (ground.id !== 0) this.sfx?.play('step', { block: ground.sound });
        }
      }
      if (!wasInWater && this.player.inWater && this.player.vy < -3) this.sfx?.play('splash');
    }

    this.highlight.update(this.interaction.target, this.interaction.breakProgress);

    // camera follows player eye
    this.camera.position.set(this.player.x, this.player.eyeY, this.player.z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');
    this.camera.rotateY(this.player.yaw);
    this.camera.rotateX(this.player.pitch);

    // underwater tint
    this.applyUnderwaterEffect();

    this.world.update(this.player.x, this.player.z, now, document.hidden ? 8 : 1);
    this.renderer.render(this.scene, this.camera);

    this.statTimer += dt;
    if (this.statTimer > 0.25) {
      this.statTimer = 0;
      this.hud.renderStats();
      this.updateDebug();
    }

    if (this.store) {
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 20) {
        this.autosaveTimer = 0;
        this.save();
      }
    }

    this.input.endFrame();
  }

  applyUnderwaterEffect() {
    const under = this.player.headInWater;
    if (under !== this._wasUnder) {
      this._wasUnder = under;
      const u = this.world.materials.uniforms;
      if (under) {
        this.scene.background = new THREE.Color(0x1a4faa);
        u.uFogColor.value.set(0x1a4faa);
        u.uFogNear.value = 4;
        u.uFogFar.value = 24;
      }
      this._forceSkyRefresh = true;
    }
    if (under) {
      const u = this.world.materials.uniforms;
      u.uFogNear.value = 4;
      u.uFogFar.value = 24;
    }
  }

  tickBlockEntities(dt) {
    tickFurnaces(this.world, dt);
    if (this.containers.open === 'furnace') {
      this._furnaceUiTimer += dt;
      if (this._furnaceUiTimer > 0.25) {
        this._furnaceUiTimer = 0;
        this.containers.refreshIfFurnace();
      }
    }
  }

  updateDebug() {
    const p = this.player;
    const biome = this.world.biomeAt(Math.floor(p.x), Math.floor(p.z));
    const light = this.world.getSkyW(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const bl = this.world.getBlockLightW(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
    const t = this.time % 1;
    const hh = Math.floor(((t + 0.25) % 1) * 24).toString().padStart(2, '0');
    const mm = Math.floor((((t + 0.25) % 1) * 24 % 1) * 60).toString().padStart(2, '0');
    this.hud.setDebug(
      `Blockverse | FPS ${this.fps}\n` +
      `XYZ ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}\n` +
      `chunk ${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}  biome ${BIOME_NAMES[biome] ?? '?'}\n` +
      `light sky ${light} block ${bl}  time ${hh}:${mm}\n` +
      `chunks ${this.world.stats.chunks} genQ ${this.world.stats.genQueue} dirty ${this.world.dirtyMeshes.size}\n` +
      `draws ${this.renderer.info.render.calls} tris ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k ` +
      `mode ${p.mode === GAMEMODE_CREATIVE ? 'creative' : 'survival'}${p.flying ? ' (fly)' : ''}`,
    );
  }

  applySettings(s) {
    this.world.renderDistance = s.renderDistance;
    this.world.centerCx = Infinity; // force re-stream at the new radius
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.player.sensitivity = s.sensitivity;
    this.sfx?.setVolume(s.volume);
  }

  pause() {
    this.paused = true;
    this.setUiOpen(true);
  }

  resume() {
    this.paused = false;
    this.setUiOpen(false);
    this.input.requestLock();
  }

  save() {
    if (!this.store) return;
    for (const c of this.world.modifiedChunks()) {
      this.store.saveChunk(this.worldMeta.id, c);
      c.modified = false;
    }
    this.store.saveWorldMeta(this.worldMeta.id, {
      timeOfDay: this.time,
      playerData: this.player.serialize(),
    });
  }

  stop() {
    this.running = false;
    if (this.store) this.save();
    this.ticker.terminate();
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('resize', this._onResize);
    this.entities.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
