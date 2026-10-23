// Container UIs: player inventory (with 2x2 crafting), workbench (3x3),
// furnace, and the creative item palette. Handles cursor stack drag logic,
// right-click split, shift-click quick move, and tooltips.

import { itemInfo, maxStack, makeStack } from '../items/items.js';
import { matchRecipe, SMELTING, SMELT_TIME } from '../items/recipes.js';
import { furnaceState } from '../items/furnace.js';
import { BLOCKS } from '../blocks/blocks.js';
import { GAMEMODE_CREATIVE } from '../core/constants.js';
import { I } from '../items/itemIds.js';

// Slot abstraction: {get: () => stack|null, set: (stack) => void, filter?: (id)=>bool, output?: bool}

export class Containers {
  constructor(game) {
    this.game = game;
    this.atlas = game.atlas;
    this.player = game.player;
    this.root = document.getElementById('ui-root');
    this.open = null;             // 'inventory' | 'crafting' | 'furnace' | null
    this.cursor = null;           // stack held by the mouse
    this.craftGrid = new Array(9).fill(null); // stacks in the 3x3 (or 2x2) grid
    this.craftSize = 2;
    this.furnacePos = null;

    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'cursor-stack';
    document.body.appendChild(this.cursorEl);
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tooltip hidden';
    document.body.appendChild(this.tooltipEl);

    document.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = `${e.clientX - 18}px`;
      this.cursorEl.style.top = `${e.clientY - 18}px`;
      this.tooltipEl.style.left = `${e.clientX + 14}px`;
      this.tooltipEl.style.top = `${e.clientY + 10}px`;
    });
  }

  isOpen() { return this.open !== null; }

  // ---------- open / close ----------

  openInventory() {
    if (this.player.mode === GAMEMODE_CREATIVE) {
      this.craftSize = 0;
    } else {
      this.craftSize = 2;
    }
    this.open = 'inventory';
    this.show();
  }

  openCrafting() {
    this.craftSize = 3;
    this.open = 'crafting';
    this.show();
  }

  openFurnace(pos) {
    this.furnacePos = { x: pos.x, y: pos.y, z: pos.z };
    this.open = 'furnace';
    this.show();
  }

  close() {
    if (!this.open) return;
    // return craft grid + cursor stack to the inventory (or drop leftovers)
    for (let i = 0; i < this.craftGrid.length; i++) {
      const s = this.craftGrid[i];
      if (s) {
        const left = this.player.give(s.id, s.count);
        if (left > 0) this.dropStack({ ...s, count: left });
        this.craftGrid[i] = null;
      }
    }
    if (this.cursor) {
      const left = this.player.give(this.cursor.id, this.cursor.count);
      if (left > 0) this.dropStack({ ...this.cursor, count: left });
      this.cursor = null;
    }
    this.open = null;
    this.furnacePos = null;
    this.root.innerHTML = '';
    this.renderCursor();
    this.tooltipEl.classList.add('hidden');
    this.game.setUiOpen(false);
    this.game.hud.renderHotbar();
    this.game.input.requestLock();
  }

  dropStack(stack) {
    const p = this.player;
    const dir = p.lookDir();
    this.game.entities.spawnDrops(p.x + dir.x, p.eyeY - 0.2, p.z + dir.z, [stack]);
  }

  // ---------- rendering ----------

  show() {
    this.game.setUiOpen(true);
    this.render();
  }

  render() {
    this.root.innerHTML = '';
    const screen = document.createElement('div');
    screen.className = 'screen dim';
    screen.addEventListener('mousedown', (e) => {
      if (e.target === screen) {
        // click outside: drop cursor stack
        if (this.cursor) {
          this.dropStack(this.cursor);
          this.cursor = null;
          this.renderCursor();
          this.render();
        }
      }
    });
    const win = document.createElement('div');
    win.className = 'inv-window';
    screen.appendChild(win);
    this.root.appendChild(screen);

    if (this.open === 'inventory' && this.player.mode === GAMEMODE_CREATIVE) {
      this.renderCreative(win);
    } else if (this.open === 'inventory') {
      this.renderCraftArea(win, 2, 'Crafting');
    } else if (this.open === 'crafting') {
      this.renderCraftArea(win, 3, 'Workbench');
    } else if (this.open === 'furnace') {
      this.renderFurnace(win);
    }

    this.renderPlayerInv(win);
    this.renderCursor();
  }

  slotEl(ref, size = null) {
    const el = document.createElement('div');
    el.className = 'slot';
    const stack = ref.get();
    if (stack) {
      const img = document.createElement('img');
      img.src = this.atlas.icon(stack.id);
      img.draggable = false;
      el.appendChild(img);
      if (stack.count > 1) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = stack.count;
        el.appendChild(c);
      }
      if (stack.dur !== undefined) {
        const info = itemInfo(stack.id);
        if (info?.tool && stack.dur < info.tool.durability) {
          const bar = document.createElement('div');
          bar.className = 'durability';
          const fill = document.createElement('div');
          fill.style.width = `${Math.round((stack.dur / info.tool.durability) * 100)}%`;
          bar.appendChild(fill);
          el.appendChild(bar);
        }
      }
      el.addEventListener('mouseenter', () => {
        const cur = ref.get();
        if (!cur) return;
        this.tooltipEl.textContent = itemInfo(cur.id)?.display ?? '?';
        this.tooltipEl.classList.remove('hidden');
      });
      el.addEventListener('mouseleave', () => this.tooltipEl.classList.add('hidden'));
    }
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clickSlot(ref, e.button, e.shiftKey);
    });
    return el;
  }

  renderPlayerInv(win) {
    const h3 = document.createElement('h3');
    h3.textContent = 'Inventory';
    win.appendChild(h3);

    const main = document.createElement('div');
    main.className = 'inv-grid cols-9';
    for (let i = 9; i < 36; i++) main.appendChild(this.slotEl(this.invRef(i)));
    win.appendChild(main);

    const hot = document.createElement('div');
    hot.className = 'inv-grid cols-9';
    hot.style.marginTop = '8px';
    for (let i = 0; i < 9; i++) hot.appendChild(this.slotEl(this.invRef(i)));
    win.appendChild(hot);
  }

  renderCraftArea(win, size, title) {
    const h3 = document.createElement('h3');
    h3.textContent = title;
    win.appendChild(h3);

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '12px';

    const grid = document.createElement('div');
    grid.className = `inv-grid cols-${size}`;
    for (let i = 0; i < size * size; i++) {
      grid.appendChild(this.slotEl(this.craftRef(i)));
    }
    row.appendChild(grid);

    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.textContent = '➜';
    row.appendChild(arrow);

    row.appendChild(this.slotEl(this.craftResultRef()));
    win.appendChild(row);
  }

  renderFurnace(win) {
    const st = furnaceState(this.game.world, this.furnacePos.x, this.furnacePos.y, this.furnacePos.z);
    const h3 = document.createElement('h3');
    h3.textContent = 'Furnace';
    win.appendChild(h3);

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '12px';

    const col = document.createElement('div');
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.gap = '4px';
    col.appendChild(this.slotEl(this.beRef(st, 'input')));

    const flame = document.createElement('div');
    flame.className = 'furnace-flame';
    flame.textContent = st.burnLeft > 0 ? '🔥' : '▫';
    const burnTrack = document.createElement('div');
    burnTrack.className = 'progress-track';
    const burnFill = document.createElement('div');
    burnFill.style.width = st.burnTotal > 0 ? `${Math.round((st.burnLeft / st.burnTotal) * 100)}%` : '0%';
    burnTrack.appendChild(burnFill);
    col.appendChild(flame);
    col.appendChild(burnTrack);
    col.appendChild(this.slotEl(this.beRef(st, 'fuel')));
    row.appendChild(col);

    const mid = document.createElement('div');
    mid.style.display = 'flex';
    mid.style.flexDirection = 'column';
    mid.style.alignItems = 'center';
    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.textContent = '➜';
    const cookTrack = document.createElement('div');
    cookTrack.className = 'progress-track';
    const cookFill = document.createElement('div');
    cookFill.style.width = `${Math.round((st.cook / SMELT_TIME) * 100)}%`;
    cookTrack.appendChild(cookFill);
    mid.appendChild(arrow);
    mid.appendChild(cookTrack);
    row.appendChild(mid);

    row.appendChild(this.slotEl(this.beRef(st, 'output')));
    win.appendChild(row);
  }

  renderCreative(win) {
    const h3 = document.createElement('h3');
    h3.textContent = 'Creative — click to grab a stack';
    win.appendChild(h3);
    const grid = document.createElement('div');
    grid.className = 'inv-grid cols-9';
    grid.style.maxHeight = '260px';
    grid.style.overflowY = 'auto';
    grid.style.marginBottom = '12px';

    const ids = [];
    for (const b of BLOCKS) {
      if (b && b.id !== 0 && b.name !== 'furnace_lit' && b.name !== 'water') ids.push(b.id);
    }
    for (const id of Object.values(I)) ids.push(id);

    for (const id of ids) {
      const ref = {
        get: () => ({ id, count: 1 }),
        set: () => {},
        creative: id,
      };
      grid.appendChild(this.slotEl(ref));
    }
    win.appendChild(grid);
  }

  renderCursor() {
    this.cursorEl.innerHTML = '';
    if (this.cursor) {
      this.cursorEl.style.display = 'block';
      const img = document.createElement('img');
      img.src = this.atlas.icon(this.cursor.id);
      this.cursorEl.appendChild(img);
      if (this.cursor.count > 1) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = this.cursor.count;
        this.cursorEl.appendChild(c);
      }
    } else {
      this.cursorEl.style.display = 'none';
    }
  }

  // ---------- slot refs ----------

  invRef(i) {
    return {
      get: () => this.player.inventory[i],
      set: (s) => { this.player.inventory[i] = s; },
      area: 'inv',
      index: i,
    };
  }

  craftRef(i) {
    return {
      get: () => this.craftGrid[i],
      set: (s) => { this.craftGrid[i] = s; },
      area: 'craft',
    };
  }

  craftResultRef() {
    return {
      get: () => {
        const size = this.craftSize;
        const grid = [];
        for (let i = 0; i < size * size; i++) grid.push(this.craftGrid[i]?.id ?? 0);
        const m = matchRecipe(grid, size, size);
        return m ? makeStack(m.id, m.count) : null;
      },
      set: () => {},
      output: 'craft',
    };
  }

  beRef(st, field) {
    return {
      get: () => st[field],
      set: (s) => { st[field] = s; },
      area: 'furnace',
      output: field === 'output' ? 'furnace' : undefined,
      filter: field === 'fuel'
        ? (id) => (itemInfo(id)?.burnTime ?? 0) > 0
        : field === 'input' ? (id) => SMELTING.has(id) : undefined,
    };
  }

  // ---------- click logic ----------

  clickSlot(ref, button, shift) {
    if (ref.creative !== undefined) {
      // creative palette: left = grab full stack, right = single
      if (this.cursor) this.cursor = null;
      else this.cursor = makeStack(ref.creative, button === 2 ? 1 : maxStack(ref.creative));
      this.renderCursor();
      this.render();
      return;
    }

    if (ref.output) {
      this.takeOutput(ref, shift);
      this.afterChange();
      return;
    }

    const cur = this.cursor;
    const inSlot = ref.get();

    if (shift && !cur && inSlot) {
      this.quickMove(ref, inSlot);
      this.afterChange();
      return;
    }

    if (button === 0) {
      // left click: swap / merge
      if (!cur && inSlot) {
        ref.set(null);
        this.cursor = inSlot;
      } else if (cur && !inSlot) {
        if (ref.filter && !ref.filter(cur.id)) return;
        ref.set(cur);
        this.cursor = null;
      } else if (cur && inSlot) {
        if (cur.id === inSlot.id && cur.dur === undefined && inSlot.dur === undefined) {
          const room = maxStack(cur.id) - inSlot.count;
          const moved = Math.min(room, cur.count);
          inSlot.count += moved;
          cur.count -= moved;
          if (cur.count <= 0) this.cursor = null;
        } else {
          if (ref.filter && !ref.filter(cur.id)) return;
          ref.set(cur);
          this.cursor = inSlot;
        }
      }
    } else if (button === 2) {
      // right click: place one / take half
      if (cur) {
        if (ref.filter && !ref.filter(cur.id)) return;
        if (!inSlot) {
          ref.set({ ...cur, count: 1 });
          cur.count--;
          if (cur.count <= 0) this.cursor = null;
        } else if (inSlot.id === cur.id && inSlot.dur === undefined && inSlot.count < maxStack(cur.id)) {
          inSlot.count++;
          cur.count--;
          if (cur.count <= 0) this.cursor = null;
        }
      } else if (inSlot) {
        const half = Math.ceil(inSlot.count / 2);
        const rest = inSlot.count - half;
        this.cursor = { ...inSlot, count: half };
        if (rest > 0) ref.set({ ...inSlot, count: rest });
        else ref.set(null);
      }
    }
    this.afterChange();
  }

  takeOutput(ref, shift) {
    const doOnce = () => {
      const out = ref.get();
      if (!out) return false;
      if (ref.output === 'craft') {
        if (this.cursor) {
          if (this.cursor.id !== out.id || this.cursor.dur !== undefined) return false;
          if (this.cursor.count + out.count > maxStack(out.id)) return false;
          this.cursor.count += out.count;
        } else {
          this.cursor = out;
        }
        // consume one item from every occupied craft cell
        for (let i = 0; i < this.craftGrid.length; i++) {
          const s = this.craftGrid[i];
          if (s) {
            s.count--;
            if (s.count <= 0) this.craftGrid[i] = null;
          }
        }
        return true;
      }
      // furnace output
      if (this.cursor) {
        if (this.cursor.id !== out.id) return false;
        if (this.cursor.count + out.count > maxStack(out.id)) return false;
        this.cursor.count += out.count;
      } else {
        this.cursor = out;
      }
      ref.set(null);
      return true;
    };

    if (shift) {
      // craft/take as much as fits, sending to inventory
      let guard = 0;
      while (guard++ < 64) {
        const out = ref.get();
        if (!out) break;
        const left = this.player.give(out.id, out.count);
        if (left > 0) break;
        if (ref.output === 'craft') {
          for (let i = 0; i < this.craftGrid.length; i++) {
            const s = this.craftGrid[i];
            if (s) {
              s.count--;
              if (s.count <= 0) this.craftGrid[i] = null;
            }
          }
        } else {
          ref.set(null);
        }
      }
    } else {
      doOnce();
    }
    this.game.sfx?.play('click');
  }

  quickMove(ref, stack) {
    if (ref.area === 'inv') {
      // move into container area if a sensible one exists, else hotbar<->main
      if (this.open === 'furnace') {
        const st = furnaceState(this.game.world, this.furnacePos.x, this.furnacePos.y, this.furnacePos.z);
        const target = SMELTING.has(stack.id) ? 'input' : (itemInfo(stack.id)?.burnTime ?? 0) > 0 ? 'fuel' : null;
        if (target) {
          const t = st[target];
          if (!t) { st[target] = stack; ref.set(null); return; }
          if (t.id === stack.id) {
            const room = maxStack(t.id) - t.count;
            const moved = Math.min(room, stack.count);
            t.count += moved;
            stack.count -= moved;
            if (stack.count <= 0) ref.set(null);
            return;
          }
        }
      }
      // hotbar <-> main swap region
      const from = ref.index;
      const targetRange = from < 9 ? [9, 36] : [0, 9];
      this.moveIntoRange(ref, stack, targetRange);
    } else {
      // container -> inventory
      const left = this.player.give(stack.id, stack.count);
      ref.set(left > 0 ? { ...stack, count: left } : null);
    }
  }

  moveIntoRange(ref, stack, [a, b]) {
    // merge first
    for (let i = a; i < b && stack.count > 0; i++) {
      const s = this.player.inventory[i];
      if (s && s.id === stack.id && s.dur === undefined && stack.dur === undefined) {
        const room = maxStack(s.id) - s.count;
        const moved = Math.min(room, stack.count);
        s.count += moved;
        stack.count -= moved;
      }
    }
    for (let i = a; i < b && stack.count > 0; i++) {
      if (!this.player.inventory[i]) {
        this.player.inventory[i] = { ...stack };
        stack.count = 0;
      }
    }
    ref.set(stack.count > 0 ? stack : null);
  }

  afterChange() {
    this.player.events.dispatchEvent(new CustomEvent('inventory'));
    this.renderCursor();
    this.render();
  }

  // called by game each frame while a furnace is open, to refresh progress bars
  refreshIfFurnace() {
    if (this.open === 'furnace') this.render();
  }
}
