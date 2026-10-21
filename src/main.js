// App orchestrator: main menu <-> game lifecycle.

import { Atlas } from './render/atlas.js';
import { Game } from './game.js';
import { SaveStore, loadSettings } from './save/store.js';
import { Screens } from './ui/screens.js';
import { Sfx } from './audio/sfx.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const hudEl = document.getElementById('hud');

const atlas = new Atlas();
const sfx = new Sfx();
let game = null;
let screens = null;
let store = null;

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

// Phones and tablets: there are no touch controls, so say so up front.
function isTouchOnly() {
  return window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches;
}

function showNoWebGL(detail) {
  screens.showNotice('This browser could not start WebGL 2', [
    'Blockverse draws the world with WebGL 2. It works in current Chrome, Edge, Firefox and Safari 15+.',
    'If you are on one of those, check that hardware acceleration is enabled in the browser settings.',
    ...(detail ? [`Details: ${detail}`] : []),
  ], [['Back to title', () => screens.showMain()]]);
}

async function boot() {
  store = await SaveStore.open();
  sfx.setVolume(loadSettings().volume);

  screens = new Screens(uiRoot, {
    store,
    sfx,
    onPlay: (id) => startWorld(id),
    onQuitToTitle: () => quitToTitle(),
    onRespawn: () => respawn(),
    onResume: () => resumeGame(),
    onApplySettings: (s) => {
      sfx.setVolume(s.volume);
      game?.applySettings(s);
    },
  });

  if (!hasWebGL2()) {
    showNoWebGL();
  } else if (isTouchOnly()) {
    screens.showNotice('Keyboard and mouse needed', [
      'Blockverse is a desktop game: you move with WASD and look around with the mouse.',
      'There are no touch controls yet, so on a phone or tablet you can browse the menus but not really play.',
    ], [['Continue anyway', () => screens.showMain()]]);
  } else {
    screens.showMain();
  }
}

async function startWorld(id) {
  const meta = await store.loadWorld(id);
  if (!meta) return;
  screens.showLoading(`Loading "${meta.name}"…`);

  const settings = screens.settings;
  try {
    game = new Game({
      canvas,
      atlas,
      worldMeta: { ...meta, renderDistance: settings.renderDistance },
      store,
      sfx,
    });
  } catch (err) {
    // Usually WebGL context creation failing (blocklisted GPU, headless
    // browser without a software renderer). Don't leave the loading screen up.
    console.error(err);
    game = null;
    showNoWebGL(err?.message);
    return;
  }
  game.applySettings(settings);

  game.uiHooks = {
    showPause: () => {
      if (game.paused || game.player.dead || game.chat.open) return;
      game.pause();
      screens.showPause();
    },
    showDeath: () => {
      game.setUiOpen(true);
      screens.showDeath();
    },
    handleKey: (code) => {
      if (code === 'Escape' && (screens.current === 'pause' || screens.current === 'settings-pause')) {
        resumeGame();
        return true;
      }
      return false;
    },
  };

  game.setUiOpen(true); // block input until loaded
  game.start();

  // wait for the area around the player to be meshed
  await new Promise((resolve) => {
    const t0 = performance.now();
    const poll = setInterval(() => {
      const pcx = Math.floor(game.player.x / 16);
      const pcz = Math.floor(game.player.z / 16);
      let meshed = 0;
      const R = 2, total = (2 * R + 1) ** 2;
      for (let dx = -R; dx <= R; dx++) {
        for (let dz = -R; dz <= R; dz++) {
          const c = game.world.getChunk(pcx + dx, pcz + dz);
          if (c?.mesh) meshed++;
        }
      }
      screens.setLoadingProgress(meshed / total);
      if (meshed >= total || performance.now() - t0 > 25000) {
        clearInterval(poll);
        resolve();
      }
    }, 200);
  });

  screens.clear();
  game.setUiOpen(false);
  game.updateDebug();
}

function resumeGame() {
  if (!game) return;
  screens.clear();
  game.resume();
}

function respawn() {
  if (!game) return;
  screens.clear();
  game.player.respawn();
  game.hud.renderStats();
  game.hud.renderHotbar();
  game.setUiOpen(false);
  game.input.requestLock();
}

function quitToTitle() {
  if (game) {
    game.stop();
    game = null;
  }
  hudEl.classList.add('hidden');
  screens.showMain();
}

boot();

// Handy from the devtools console: __game.player, __game.world, ...
Object.defineProperty(window, '__game', { get: () => game, configurable: true });
