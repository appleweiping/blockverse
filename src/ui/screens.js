// Full-screen UI shell: main menu, world management, loading, pause,
// settings, death screen.

import { hashString } from '../core/rng.js';
import { GAMEMODE_SURVIVAL, GAMEMODE_CREATIVE } from '../core/constants.js';
import { loadSettings, saveSettings } from '../save/store.js';

export class Screens {
  constructor(root, { onPlay, onQuitToTitle, onRespawn, onResume, onApplySettings, store, sfx }) {
    this.root = root;
    this.onPlay = onPlay;
    this.onQuitToTitle = onQuitToTitle;
    this.onRespawn = onRespawn;
    this.onResume = onResume;
    this.onApplySettings = onApplySettings;
    this.store = store;
    this.sfx = sfx;
    this.current = null;
    this.settings = loadSettings();
  }

  clear() {
    this.root.innerHTML = '';
    this.current = null;
  }

  screen(className = 'screen menu-bg') {
    this.clear();
    const el = document.createElement('div');
    el.className = className;
    this.root.appendChild(el);
    return el;
  }

  btn(label, onClick, cls = 'btn') {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', () => { this.sfx?.play('click'); onClick(); });
    return b;
  }

  title(el, sub = true) {
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = 'BLOCKVERSE';
    el.appendChild(t);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'subtitle';
      s.textContent = 'Ride the wind up to the sky islands';
      el.appendChild(s);
    }
  }

  // ---------- main menu ----------

  async showMain() {
    const el = this.screen();
    this.current = 'main';
    this.title(el);

    const worlds = await this.store.listWorlds();
    let selected = worlds[0]?.id ?? null;

    const list = document.createElement('div');
    list.className = 'world-list';
    if (worlds.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '14px';
      empty.style.color = '#999';
      empty.textContent = 'No worlds yet — create one below.';
      list.appendChild(empty);
    }
    const entries = new Map();
    for (const w of worlds) {
      const e = document.createElement('div');
      e.className = 'world-entry';
      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'w-name';
      name.textContent = w.name;
      const info = document.createElement('div');
      info.className = 'w-info';
      const mode = w.mode === GAMEMODE_CREATIVE ? 'Creative' : 'Survival';
      info.textContent = `${mode} · seed ${w.seed} · ${new Date(w.lastPlayed).toLocaleString()}`;
      left.appendChild(name);
      left.appendChild(info);
      e.appendChild(left);
      e.addEventListener('click', () => {
        selected = w.id;
        for (const [, el2] of entries) el2.classList.remove('selected');
        e.classList.add('selected');
      });
      e.addEventListener('dblclick', () => this.onPlay(w.id));
      entries.set(w.id, e);
      list.appendChild(e);
    }
    if (selected) entries.get(selected)?.classList.add('selected');
    el.appendChild(list);

    const row = document.createElement('div');
    row.className = 'row';
    row.appendChild(this.btn('Play Selected World', () => {
      if (selected) this.onPlay(selected);
    }, 'btn'));
    el.appendChild(row);

    const row2 = document.createElement('div');
    row2.className = 'row';
    row2.appendChild(this.btn('Create New World', () => this.showCreate(), 'btn small'));
    row2.appendChild(this.btn('Settings', () => this.showSettings(() => this.showMain()), 'btn small'));
    row2.appendChild(this.btn('Delete World', async () => {
      if (!selected) return;
      const w = worlds.find((x) => x.id === selected);
      if (confirm(`Delete world "${w.name}" forever?`)) {
        await this.store.deleteWorld(selected);
        this.showMain();
      }
    }, 'btn small danger'));
    el.appendChild(row2);

    const foot = document.createElement('div');
    foot.style.cssText = 'position:absolute;bottom:10px;font-size:12px;color:#888';
    foot.textContent = 'Blockverse · open source · github.com/appleweiping/blockverse';
    el.appendChild(foot);
  }

  // ---------- create world ----------

  showCreate() {
    const el = this.screen();
    this.current = 'create';
    this.title(el, false);

    const mkField = (labelText, inputEl) => {
      const f = document.createElement('div');
      f.className = 'field';
      const l = document.createElement('label');
      l.textContent = labelText;
      f.appendChild(l);
      f.appendChild(inputEl);
      el.appendChild(f);
      return f;
    };

    const nameIn = document.createElement('input');
    nameIn.value = 'New World';
    nameIn.maxLength = 32;
    mkField('World name', nameIn);

    const seedIn = document.createElement('input');
    seedIn.placeholder = 'Leave empty for a random seed';
    mkField('Seed (any text or number)', seedIn);

    const modeSel = document.createElement('select');
    for (const [v, label] of [[GAMEMODE_SURVIVAL, 'Survival'], [GAMEMODE_CREATIVE, 'Creative']]) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      modeSel.appendChild(o);
    }
    mkField('Game mode', modeSel);

    el.appendChild(this.btn('Create World', async () => {
      const seedText = seedIn.value.trim();
      let seed;
      if (seedText === '') seed = (Math.random() * 0xffffffff) >>> 0;
      else if (/^-?\d+$/.test(seedText)) seed = (parseInt(seedText, 10) >>> 0);
      else seed = hashString(seedText);
      const meta = await this.store.createWorld({
        name: nameIn.value.trim() || 'New World',
        seed,
        mode: parseInt(modeSel.value, 10),
        renderDistance: this.settings.renderDistance,
      });
      this.onPlay(meta.id);
    }));
    el.appendChild(this.btn('Back', () => this.showMain(), 'btn small'));
    setTimeout(() => nameIn.focus(), 0);
  }

  // ---------- loading ----------

  showLoading(text = 'Generating world…') {
    const el = this.screen('screen menu-bg');
    this.current = 'loading';
    this.title(el, false);
    const label = document.createElement('div');
    label.textContent = text;
    el.appendChild(label);
    const track = document.createElement('div');
    track.className = 'loading-bar-track';
    const fill = document.createElement('div');
    track.appendChild(fill);
    el.appendChild(track);
    this._loadingLabel = label;
    this._loadingFill = fill;
  }

  setLoadingProgress(frac) {
    if (this._loadingFill) this._loadingFill.style.width = `${Math.round(frac * 100)}%`;
  }

  // ---------- pause ----------

  showPause() {
    const el = this.screen('screen dim');
    this.current = 'pause';
    const h = document.createElement('div');
    h.className = 'title';
    h.style.fontSize = '30px';
    h.textContent = 'Game Paused';
    el.appendChild(h);
    el.appendChild(this.btn('Back to Game', () => this.onResume()));
    el.appendChild(this.btn('Settings', () => this.showSettings(() => this.showPause())));
    el.appendChild(this.btn('Save & Quit to Title', () => this.onQuitToTitle()));
  }

  // ---------- settings ----------

  showSettings(back) {
    const el = this.screen(this.current === 'pause' || this.current === 'settings-pause' ? 'screen dim' : 'screen menu-bg');
    this.current = this.current === 'pause' ? 'settings-pause' : 'settings';
    const h = document.createElement('div');
    h.className = 'title';
    h.style.fontSize = '30px';
    h.textContent = 'Settings';
    el.appendChild(h);

    const slider = (label, min, max, step, value, fmt, onChange) => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      const l = document.createElement('label');
      l.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step; input.value = value;
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = fmt(value);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        val.textContent = fmt(v);
        onChange(v);
        this.applySettings();
      });
      row.appendChild(l); row.appendChild(input); row.appendChild(val);
      el.appendChild(row);
    };

    const s = this.settings;
    slider('Render distance', 2, 16, 1, s.renderDistance, (v) => `${v}`, (v) => { s.renderDistance = v; });
    slider('Field of view', 60, 110, 1, s.fov, (v) => `${v}°`, (v) => { s.fov = v; });
    slider('Mouse sensitivity', 0.2, 2.5, 0.05, s.sensitivity, (v) => `${(+v).toFixed(2)}`, (v) => { s.sensitivity = v; });
    slider('Volume', 0, 1, 0.05, s.volume, (v) => `${Math.round(v * 100)}%`, (v) => { s.volume = v; });

    el.appendChild(this.btn('Done', () => back(), 'btn small'));
  }

  applySettings() {
    saveSettings(this.settings);
    this.onApplySettings?.(this.settings);
  }

  // ---------- notices (no WebGL, touch-only device, errors) ----------

  showNotice(heading, lines, actions = []) {
    const el = this.screen();
    this.current = 'notice';
    this.title(el, false);
    const box = document.createElement('div');
    box.className = 'notice';
    const h = document.createElement('h2');
    h.textContent = heading;
    box.appendChild(h);
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      box.appendChild(p);
    }
    el.appendChild(box);
    for (const [label, fn] of actions) el.appendChild(this.btn(label, fn, 'btn small'));
  }

  // ---------- death ----------

  showDeath() {
    const el = this.screen('screen dim');
    this.current = 'death';
    el.style.background = 'rgba(120, 10, 10, 0.45)';
    const h = document.createElement('div');
    h.className = 'death-title';
    h.textContent = 'You died!';
    el.appendChild(h);
    el.appendChild(this.btn('Respawn', () => this.onRespawn()));
    el.appendChild(this.btn('Title Screen', () => this.onQuitToTitle()));
  }
}
