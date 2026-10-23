// Sky system: sun, moon, stars, drifting clouds, day/night colors.
// All sprites and cloud shapes are generated procedurally.

import * as THREE from 'three';
import { generateTile } from './textures.js';
import { mulberry32 } from '../core/rng.js';

const DAY_ZENITH = new THREE.Color(0x6f9fe8);
const DAY_HORIZON = new THREE.Color(0x9cc4f0);
const NIGHT = new THREE.Color(0x070b18);
const DUSK = new THREE.Color(0xe08a4e);

function makeCloudTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const rng = mulberry32(0xC10D5);
  // blocky cloud blobs on a coarse grid (wraps at edges)
  const grid = 32, cell = size / grid;
  const map = new Uint8Array(grid * grid);
  for (let i = 0; i < 46; i++) {
    const cx = (rng() * grid) | 0;
    const cy = (rng() * grid) | 0;
    const w = 3 + ((rng() * 6) | 0);
    const h = 2 + ((rng() * 3) | 0);
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        if (rng() < 0.12) continue;
        map[(((cy + dy) % grid) * grid) + ((cx + dx) % grid)] = 1;
      }
    }
  }
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (map[y * grid + x]) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export class Sky {
  constructor(scene, worldUniforms) {
    this.scene = scene;
    this.uniforms = worldUniforms;
    this.group = new THREE.Group();
    scene.add(this.group);

    const spriteMat = (tile) => {
      const tex = new THREE.CanvasTexture(generateTile(tile));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, fog: false, depthWrite: false, side: THREE.DoubleSide,
      });
    };

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), spriteMat('sun'));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), spriteMat('moon'));
    this.group.add(this.sun);
    this.group.add(this.moon);

    // stars: fixed dome of points
    const starRng = mulberry32(0x57A125);
    const starCount = 700;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // random direction, upper hemisphere biased
      let x = starRng() * 2 - 1, y = starRng(), z = starRng() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      pos[i * 3] = (x / l) * 460;
      pos[i * 3 + 1] = (y / l) * 460;
      pos[i * 3 + 2] = (z / l) * 460;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.group.add(this.stars);

    // clouds: two large translucent planes drifting overhead
    this.cloudTex = makeCloudTexture();
    const cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTex, transparent: true, opacity: 0.85, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 160; // above the sky islands and the top of a wind column
    this.cloudTex.repeat.set(3, 3);
    scene.add(this.clouds);

    this._bg = new THREE.Color();
    this._fog = new THREE.Color();
  }

  // time: 0..1 (0 = sunrise), day: brightness factor, p: player
  update(time, day, p, underwater) {
    const angle = time * Math.PI * 2; // 0 = sunrise east horizon
    const R = 420;

    this.group.position.set(p.x, p.y, p.z);
    const sx = Math.cos(angle) * R;
    const sy = Math.sin(angle) * R;
    this.sun.position.set(sx, sy, 0);
    this.sun.lookAt(p.x, p.y, p.z);
    this.moon.position.set(-sx, -sy, 0);
    this.moon.lookAt(p.x, p.y, p.z);

    const night = 1 - Math.min(1, day * 1.6);
    this.starMat.opacity = Math.max(0, night - 0.15);

    // clouds follow the player, drift with time via texture offset
    this.clouds.position.x = p.x;
    this.clouds.position.z = p.z;
    this.cloudTex.offset.set(
      (p.x / 466 + performance.now() * 0.0000045) % 1,
      (p.z / 466) % 1,
    );
    this.clouds.material.opacity = 0.25 + 0.6 * day;

    if (!underwater) {
      // sky color: day <-> night with a warm band at dawn/dusk
      const el = Math.sin(angle); // sun elevation -1..1
      this._bg.copy(DAY_ZENITH).lerp(NIGHT, 1 - Math.max(0.04, Math.min(1, 0.5 + el * 2.2)));
      const duskAmount = Math.max(0, 1 - Math.abs(el) * 5) * 0.55;
      this._bg.lerp(DUSK, duskAmount);
      this._fog.copy(DAY_HORIZON).lerp(NIGHT, 1 - Math.max(0.05, Math.min(1, 0.5 + el * 2.2)));
      this._fog.lerp(DUSK, duskAmount);
      this.scene.background = this._bg;
      this.uniforms.uFogColor.value.copy(this._fog);
    }
  }
}
