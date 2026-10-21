import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRecipe } from '../src/items/recipes.js';
import { B } from '../src/blocks/blocks.js';
import { I } from '../src/items/itemIds.js';

const _ = 0;

test('a log anywhere in the 2x2 grid makes four planks of the same wood', () => {
  assert.deepEqual(matchRecipe([_, _, _, B.BIRCH_LOG], 2, 2), { id: B.BIRCH_PLANKS, count: 4 });
  assert.deepEqual(matchRecipe([B.OAK_LOG, _, _, _], 2, 2), { id: B.OAK_PLANKS, count: 4 });
});

test('shaped recipes match wherever they sit in the grid', () => {
  const P = B.OAK_PLANKS;
  assert.deepEqual(matchRecipe([P, _, _, P, _, _, _, _, _], 3, 3), { id: I.STICK, count: 4 });
  assert.deepEqual(matchRecipe([_, _, _, _, _, P, _, _, P], 3, 3), { id: I.STICK, count: 4 });
});

test('a pickaxe needs the exact shape', () => {
  const C = B.COBBLESTONE, S = I.STICK;
  assert.deepEqual(matchRecipe([C, C, C, _, S, _, _, S, _], 3, 3), { id: I.STONE_PICKAXE, count: 1 });
  assert.equal(matchRecipe([C, C, _, _, S, _, _, S, _], 3, 3), null);
  assert.equal(matchRecipe([C, C, C, _, S, _, S, _, _], 3, 3), null);
});

test('mirrored shapes are accepted', () => {
  const X = I.IRON_INGOT, S = I.STICK;
  const axe = [X, X, _, X, S, _, _, S, _];
  const mirrored = [_, X, X, _, S, X, _, S, _];
  assert.deepEqual(matchRecipe(axe, 3, 3), { id: I.IRON_AXE, count: 1 });
  assert.deepEqual(matchRecipe(mirrored, 3, 3), { id: I.IRON_AXE, count: 1 });
});

test('mixed wood species still count as planks for tools', () => {
  const S = I.STICK;
  const grid = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, _, S, _, _, S, _];
  assert.deepEqual(matchRecipe(grid, 3, 3), { id: I.WOOD_PICKAXE, count: 1 });
});

test('an empty or nonsense grid crafts nothing', () => {
  assert.equal(matchRecipe([_, _, _, _], 2, 2), null);
  assert.equal(matchRecipe([B.DIRT, B.SAND, _, _], 2, 2), null);
});
