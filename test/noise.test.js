import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Noise } from '../src/core/noise.js';
import { mulberry32, hashString, hashCoords } from '../src/core/rng.js';

test('mulberry32 is reproducible and stays in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('hashString is FNV-1a', () => {
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.notEqual(hashCoords(1, 0, 0), hashCoords(1, 0, 1));
});

test('noise is a pure function of the seed', () => {
  const n1 = new Noise(1234), n2 = new Noise(1234), other = new Noise(1235);
  let differs = false;
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37, y = i * -0.71, z = i * 0.13;
    assert.equal(n1.noise2(x, y), n2.noise2(x, y));
    assert.equal(n1.noise3(x, y, z), n2.noise3(x, y, z));
    if (n1.noise2(x, y) !== other.noise2(x, y)) differs = true;
  }
  assert.ok(differs, 'a different seed should give a different field');
});

test('noise is zero on lattice points and bounded elsewhere', () => {
  const n = new Noise(7);
  assert.equal(n.noise2(3, 5), 0);
  assert.equal(n.noise3(-2, 4, 9), 0);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const v = n.noise2(i * 0.173, i * 0.0911);
    min = Math.min(min, v); max = Math.max(max, v);
    const f = n.fbm2(i * 0.05, i * 0.031, 4);
    assert.ok(f >= -1 && f <= 1, `fbm out of range: ${f}`);
  }
  assert.ok(min >= -1 && max <= 1, `noise2 range ${min}..${max}`);
  assert.ok(max - min > 1, 'noise2 should use most of its range');
});

test('noise is continuous', () => {
  const n = new Noise(99);
  for (let i = 0; i < 500; i++) {
    const x = i * 0.29, y = i * 0.17;
    assert.ok(Math.abs(n.noise2(x, y) - n.noise2(x + 1e-4, y)) < 1e-2);
  }
});
