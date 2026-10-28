// Engine checks: run with `npm test` (Node 18+, no dependencies).
'use strict';
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

// same defaults as the page (src/app.html readParams)
const base = {
  unit: [28, 19, 14], unitKg: 1.1, // made-up example product
  pallets: [{ L: 120, W: 80, H: 150 }], heightIncludesBase: true, baseH: 15, palletTare: 20, overhang: 0, maxPalletKg: 0,
  board: { t: 3.2, ect: 5.6, gsm: 0.55 }, clearance: 0.3, tolerance: 0.4,
  minUnits: 2, maxUnits: 40, maxCartonKg: 20, maxSide: 120, upright: true, productUp: false, flapMode: 'auto',
  brick: true, brickMin: 0.5, tieOverlap: 0.2, sf: 4, interlockKeep: 0.6, sideFactor: 0.5, palletStack: 1,
  divisor: 6000, rate: 0, maxPerAxis: 8, fullTop: 60,
};
const prm = (over) => Object.assign({}, base, over);

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

// every carton inside the pallet footprint and height, and no two cartons overlapping
function checkGeometry(p, sc) {
  const boxes = E.placements(p, sc), L = E.mm(sc.pal.L), W = E.mm(sc.pal.W), H = E.mm(sc.usable);
  assert.equal(boxes.length, sc.boxes, 'placements count matches the stack');
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= L && a.y + a.l <= W && a.z + a.h <= H, `carton ${i} is outside the pallet envelope`);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.l && b.y < a.y + a.l && a.z < b.z + b.h && b.z < a.z + a.h;
      assert.ok(!overlap, `cartons ${i} and ${j} overlap`);
    }
  }
}

test('RSC walls: 2 board thicknesses on the sides, 4 on the flap side', () => {
  assert.deepEqual(E.walls(base, 2).map((v) => +v.toFixed(2)), [0.64, 0.64, 1.28]);
  assert.deepEqual(E.outerOf(base, [28.3, 19.3, 42.3], 2), [28.94, 19.94, 43.58]);
});

test('default board, 6 mm double wall: 12 mm on length and width, 24 mm on the flap side', () => {
  const p = prm({ board: { t: 6, ect: 7.7, gsm: 0.9 } });
  assert.deepEqual(E.walls(p, 2).map((v) => +v.toFixed(2)), [1.2, 1.2, 2.4]);
  assert.deepEqual(E.outerOf(p, [28.3, 19.3, 42.3], 2), [29.5, 20.5, 44.7]);
});

test('example pack-out: 3-unit carton gives 144 units, interlocked, under 150 cm', () => {
  const c = E.evalArrangement(base, [1, 1, 3], [28, 19, 14], 2);
  const sc = c.scen[0];
  assert.equal(sc.units, 144);
  assert.equal(sc.boxes, 48);
  assert.deepEqual(sc.layers.map((l) => l.cnt), [16, 16, 16]);
  near(sc.builtCm + base.baseH, 145.8, 0.01, 'total height'); // carton sizes are packed in whole mm (43.58 -> 43.6 cm)
  assert.ok(sc.minTie >= base.brickMin, 'every layer bridges the joints below');
  assert.ok(sc.comp.margin >= 1, 'compression margin');
  checkGeometry(base, sc);
});

test('full search: shortlisted cartons are valid brick-wall builds', () => {
  const r = E.run(base);
  assert.ok(r.total > 0 && r.cartons.length > 0);
  const best = Math.max(...r.cartons.map((c) => c.scen[0].units));
  assert.ok(best >= 144, `best carton holds ${best} units`);
  for (const c of r.cartons.slice(0, 15)) {
    const sc = c.scen[0];
    if (sc.layers.length > 1) assert.ok(sc.minTie >= base.brickMin, `${c.id} interlock ${sc.minTie}`);
    checkGeometry(base, sc);
  }
});

test('keep product upright: the unit height always points up', () => {
  const p = prm({ productUp: true });
  const r = E.run(p);
  for (const c of r.cartons) for (const ly of c.scen[0].layers) assert.equal(c.ori[ly.axis], p.unit[2], `${c.id} lays the unit over`);
});

test('several pallet options are evaluated side by side', () => {
  const p = prm({ pallets: [{ L: 120, W: 80, H: 150 }, { L: 120, W: 100, H: 150 }, { L: 110, W: 110, H: 150 }] });
  const c = E.evalArrangement(p, [1, 1, 3], [28, 19, 14], 2);
  assert.equal(c.scen.length, 3);
  c.scen.forEach((sc) => checkGeometry(p, sc));
});

test('your own carton: fits when the units fit, reports when they do not', () => {
  const ok = E.evalCustom(base, [56.3, 19.3, 42.3], 6, 2);
  assert.ok(ok.fits && ok.cap >= 6);
  const no = E.evalCustom(base, [20, 20, 20], 2, 2);
  assert.equal(no.fits, false);
});

test('small products finish in reasonable time (no freeze)', () => {
  const t0 = Date.now();
  const r = E.run(prm({ unit: [15, 8, 4], unitKg: 0.3 }));
  const ms = Date.now() - t0;
  assert.ok(r.cartons.length > 0);
  assert.ok(ms < 20000, `took ${ms} ms`);
});

console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
