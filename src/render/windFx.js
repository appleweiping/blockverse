// Visible wind: pale streaks rising through the columns above nearby wind
// vents. Purely cosmetic; the lift itself lives in world/wind.js.

import * as THREE from 'three';
import { columnTop } from '../world/wind.js';

const RADIUS = 48;          // only columns this close to the player
const MAX_COLUMNS = 6;      // the nearest ones get particles
const PER_COLUMN = 110;
const COUNT = MAX_COLUMNS * PER_COLUMN;

export class WindFx {
  constructor(scene, world) {
    this.world = world;
    this.columns = [];
    this.refresh = 0;
    this.pos = new Float32Array(COUNT * 3);
    this.p = [];
    for (let i = 0; i < COUNT; i++) this.p.push({ col: -1, y: 0, speed: 0, ang: 0, r: 0 });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xf2f8ff, size: 0.16, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, player) {
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 0.5;
      const old = this.columns;
      this.columns = this.world.ventsNear(player.x, player.z, RADIUS)
        .map((v) => ({ x: v.x + 0.5, z: v.z + 0.5, y0: v.y + 1, y1: columnTop(this.world, v.x, v.y, v.z) }))
        .filter((c) => c.y1 - c.y0 >= 2)
        .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
        .slice(0, MAX_COLUMNS);
      // particles stay on their column if it is still in the list
      const index = new Map(this.columns.map((c, i) => [`${c.x},${c.y0},${c.z}`, i]));
      for (const q of this.p) {
        const c = old[q.col];
        q.col = c ? index.get(`${c.x},${c.y0},${c.z}`) ?? -1 : -1;
        if (q.col < 0) q.speed = 0; // respawn anywhere along its next column
      }
    }

    const n = Math.min(COUNT, this.columns.length * PER_COLUMN);
    for (let i = 0; i < n; i++) {
      const q = this.p[i];
      let c = this.columns[q.col];
      if (!c || q.y > c.y1) {
        q.col = i % this.columns.length;
        c = this.columns[q.col];
        q.y = c.y0 + Math.random() * (c.y1 - c.y0) * (q.speed ? 0.1 : 1);
        q.speed = 5 + Math.random() * 6;
        q.ang = Math.random() * Math.PI * 2;
        q.r = 0.1 + Math.random() * 0.3;
      }
      q.y += q.speed * dt;
      q.ang += dt * 2.5;
      this.pos[i * 3] = c.x + Math.cos(q.ang) * q.r;
      this.pos[i * 3 + 1] = q.y;
      this.pos[i * 3 + 2] = c.z + Math.sin(q.ang) * q.r;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
