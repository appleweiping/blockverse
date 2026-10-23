// Chat log + command console. All user text is rendered with textContent.

import { BLOCKS } from '../blocks/blocks.js';
import { itemInfo, I } from '../items/items.js';
import { GAMEMODE_CREATIVE, GAMEMODE_SURVIVAL } from '../core/constants.js';

// name -> id lookup across blocks and items
const NAME_TO_ID = new Map();
for (const b of BLOCKS) if (b && b.id !== 0) NAME_TO_ID.set(b.name, b.id);
for (const id of Object.values(I)) {
  const info = itemInfo(id);
  if (info) NAME_TO_ID.set(info.name, id);
}

export class Chat {
  constructor(game) {
    this.game = game;
    this.logEl = document.getElementById('chat-log');
    this.rowEl = document.getElementById('chat-input-row');
    this.inputEl = document.getElementById('chat-input');
    this.open = false;

    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.inputEl.value.trim();
        this.hide();
        if (text) this.submit(text);
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  show(prefill = '') {
    this.open = true;
    this.rowEl.classList.remove('hidden');
    this.inputEl.value = prefill;
    this.game.setUiOpen(true);
    setTimeout(() => this.inputEl.focus(), 0);
  }

  hide() {
    this.open = false;
    this.rowEl.classList.add('hidden');
    this.inputEl.value = '';
    this.inputEl.blur();
    this.game.setUiOpen(false);
    this.game.input.requestLock();
  }

  message(text, color = '#fff') {
    const el = document.createElement('div');
    el.className = 'msg';
    el.textContent = text;      // textContent: no HTML injection
    el.style.color = color;
    this.logEl.appendChild(el);
    while (this.logEl.children.length > 12) this.logEl.firstChild.remove();
    setTimeout(() => { el.style.opacity = '0'; }, 8000);
    setTimeout(() => { el.remove(); }, 9500);
  }

  submit(text) {
    if (!text.startsWith('/')) {
      this.message(`<you> ${text}`);
      return;
    }
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    try {
      this.run(cmd.toLowerCase(), args);
    } catch (err) {
      this.message(`Error: ${err.message}`, '#ff8080');
    }
  }

  run(cmd, args) {
    const g = this.game;
    const p = g.player;
    switch (cmd) {
      case 'help':
        this.message('/tp <x> <y> <z> — teleport');
        this.message('/time set <day|noon|night|midnight|0..1>');
        this.message('/give <item> [count] — e.g. /give diamond_pickaxe');
        this.message('/mode <survival|creative>');
        this.message('/seed  /spawn  /kill  /clear  /rd <2-16>  /heal');
        break;
      case 'tp': {
        if (args.length < 3) throw new Error('usage: /tp x y z');
        const [x, y, z] = args.map(Number);
        if ([x, y, z].some(Number.isNaN)) throw new Error('coordinates must be numbers');
        p.x = x; p.y = y; p.z = z;
        p.vx = p.vy = p.vz = 0;
        p.fallStart = null;
        this.message(`Teleported to ${x} ${y} ${z}`, '#9fdcff');
        break;
      }
      case 'time': {
        if (args[0] !== 'set' || args.length < 2) throw new Error('usage: /time set <value>');
        const presets = { day: 0.06, noon: 0.25, sunset: 0.5, night: 0.6, midnight: 0.75 };
        const v = presets[args[1]] ?? Number(args[1]);
        if (Number.isNaN(v)) throw new Error('unknown time value');
        g.time = ((v % 1) + 1) % 1;
        this.message(`Time set to ${g.time.toFixed(2)}`, '#9fdcff');
        break;
      }
      case 'give': {
        if (!args[0]) throw new Error('usage: /give <item> [count]');
        const id = NAME_TO_ID.get(args[0].toLowerCase());
        if (!id) throw new Error(`unknown item "${args[0]}"`);
        const count = Math.max(1, Math.min(64, parseInt(args[1] ?? '1', 10) || 1));
        const left = p.give(id, count);
        g.hud.renderHotbar();
        this.message(`Gave ${count - left}× ${itemInfo(id).display}`, '#9fdcff');
        break;
      }
      case 'mode': {
        const m = args[0]?.[0];
        if (m === 'c' || args[0] === '1') p.mode = GAMEMODE_CREATIVE;
        else if (m === 's' || args[0] === '0') { p.mode = GAMEMODE_SURVIVAL; p.flying = false; }
        else throw new Error('usage: /mode <survival|creative>');
        g.hud.renderStats();
        this.message(`Game mode: ${p.mode === GAMEMODE_CREATIVE ? 'creative' : 'survival'}`, '#9fdcff');
        break;
      }
      case 'seed':
        this.message(`Seed: ${g.worldMeta.seed}`, '#9fdcff');
        break;
      case 'spawn':
        p.x = p.spawnPoint.x; p.y = p.spawnPoint.y; p.z = p.spawnPoint.z;
        p.vx = p.vy = p.vz = 0;
        p.fallStart = null;
        this.message('Returned to spawn', '#9fdcff');
        break;
      case 'kill':
        p.hurtCooldown = 0;
        p.damage(1000, 'command');
        break;
      case 'heal':
        p.health = p.maxHealth;
        p.hunger = 20;
        p.air = 20;
        g.hud.renderStats();
        this.message('Healed', '#9fdcff');
        break;
      case 'clear':
        p.inventory.fill(null);
        p.events.dispatchEvent(new CustomEvent('inventory'));
        this.message('Inventory cleared', '#9fdcff');
        break;
      case 'rd': {
        const n = parseInt(args[0], 10);
        if (!n || n < 2 || n > 16) throw new Error('usage: /rd <2-16>');
        g.world.renderDistance = n;
        g.world.centerCx = Infinity; // force re-stream
        this.message(`Render distance: ${n}`, '#9fdcff');
        break;
      }
      default:
        throw new Error(`unknown command /${cmd} — try /help`);
    }
  }
}
