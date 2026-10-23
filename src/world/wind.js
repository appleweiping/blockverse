// Wind vents. A vent blows a column of air straight up: anything standing
// in that column (the player, dropped items) is lifted until the column is
// blocked by a solid block or the lift runs out VENT_REACH blocks above the
// vent. A player who has been lifted glides back down slowly and takes no
// fall damage until they land (see player.js).
//
// Pure functions over a ChunkStore-like object ({ getBlockW }), so the rules
// are unit-tested in Node without three.js.

import { B, BLOCKS } from '../blocks/blocks.js';
import { CHUNK_Y } from '../core/constants.js';

export const VENT_REACH = 72;     // blocks of lift above a vent
export const LIFT_SPEED = 9;      // upward speed the column pushes toward (blocks/s)
export const LIFT_TAPER = 6;      // the push fades out over the last few blocks
export const GLIDE_FALL = 3.5;    // max fall speed after leaving a column
const TOP = CHUNK_Y + 16;         // columns may poke a little above the build limit

// Air the wind can pass through: anything non-solid that isn't liquid
// (plants and torches don't stop it, water does).
export function windPasses(id) {
  const b = BLOCKS[id];
  return !!b && !b.solid && !b.fluid;
}

// Lift strength 0..1 at world point (x, y, z): walk down the column through
// passable cells until a vent (lift) or anything else (no lift) turns up.
export function liftAt(world, x, y, z) {
  const wx = Math.floor(x), wy = Math.floor(y), wz = Math.floor(z);
  if (wy >= TOP || !windPasses(world.getBlockW(wx, wy, wz))) return 0;
  for (let k = 1; k <= VENT_REACH + 1; k++) {
    const id = world.getBlockW(wx, wy - k, wz);
    if (id === B.WIND_VENT) return taper(y - (wy - k + 1));
    if (!windPasses(id)) return 0;
  }
  return 0;
}

// height above the vent's top face -> lift factor
function taper(h) {
  const left = VENT_REACH - h;
  if (left <= 0) return 0;
  return Math.min(1, left / LIFT_TAPER);
}

// Top of the open air column above a vent at (wx, wy, wz): the first y where
// the wind is blocked, capped at the vent's reach.
export function columnTop(world, wx, wy, wz) {
  const cap = Math.min(wy + VENT_REACH, TOP);
  for (let y = wy + 1; y < cap; y++) {
    if (y >= CHUNK_Y) return cap;
    if (!windPasses(world.getBlockW(wx, y, wz))) return y;
  }
  return cap;
}
