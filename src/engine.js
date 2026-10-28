/* PalEngine v3: master carton construction + pallet build + transit estimates. Lengths in cm at the API, mm inside the packer. */
(function (root) {
  'use strict';

  // ---------- 2D layer packing (guillotine recursion + 5-block pinwheel) ----------
  const packers = new Map();
  function getPacker(a, b) {
    if (a > b) { const t = a; a = b; b = t; }
    const key = a + ',' + b;
    let pk = packers.get(key);
    if (pk) return pk;
    const LIM = 2600; // mm, longest pallet side incl. overhang we support
    const set = new Set();
    for (let i = 0; i * a <= LIM; i++) for (let j = 0; i * a + j * b <= LIM; j++) set.add(i * a + j * b);
    const combos = Array.from(set).sort((x, y) => x - y);
    const memo = new Map(), pin = new Map();
    const norm = (v) => {
      let lo = 0, hi = combos.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (combos[m] <= v) lo = m; else hi = m - 1; }
      return combos[lo];
    };
    function G(l, w) {
      l = norm(l); w = norm(w);
      if (l < a || w < a) return 0;
      const k = l * 100000 + w;
      const hit = memo.get(k);
      if (hit) return hit.v;
      const s1 = Math.floor(l / a) * Math.floor(w / b), s2 = Math.floor(l / b) * Math.floor(w / a);
      let best = s1 >= s2 ? s1 : s2, ch = s1 >= s2 ? [0] : [1];
      const ub = Math.floor((l * w) / (a * b));
      if (best < ub && ub > 150) {
        // many small cartons: two homogeneous blocks side by side is close to optimal and keeps the search bounded
        const blk = (x, y) => Math.max(Math.floor(x / a) * Math.floor(y / b), Math.floor(x / b) * Math.floor(y / a));
        for (let i = 1; i < combos.length && combos[i] < l; i++) { const v = blk(combos[i], w) + blk(l - combos[i], w); if (v > best) { best = v; ch = [4, combos[i]]; } }
        for (let i = 1; i < combos.length && combos[i] < w; i++) { const v = blk(l, combos[i]) + blk(l, w - combos[i]); if (v > best) { best = v; ch = [5, combos[i]]; } }
      } else if (best < ub) {
        for (let i = 1; i < combos.length && combos[i] <= l / 2 && best < ub; i++) {
          const c = combos[i], v = G(c, w) + G(l - c, w);
          if (v > best) { best = v; ch = [2, c]; }
        }
        for (let i = 1; i < combos.length && combos[i] <= w / 2 && best < ub; i++) {
          const c = combos[i], v = G(l, c) + G(l, w - c);
          if (v > best) { best = v; ch = [3, c]; }
        }
      }
      memo.set(k, { v: best, c: ch });
      return best;
    }
    function place(l, w, x, y, out) {
      l = norm(l); w = norm(w);
      if (l < a || w < a) return;
      G(l, w);
      const ch = memo.get(l * 100000 + w).c;
      if (ch[0] === 0 || ch[0] === 1) {
        const p = ch[0] === 0 ? a : b, q = ch[0] === 0 ? b : a;
        const nx = Math.floor(l / p), ny = Math.floor(w / q);
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push({ x: x + i * p, y: y + j * q, w: p, l: q });
      } else if (ch[0] === 4 || ch[0] === 5) {
        const grid = (gx, gy, gl, gw) => {
          const o = Math.floor(gl / a) * Math.floor(gw / b) >= Math.floor(gl / b) * Math.floor(gw / a);
          const p = o ? a : b, q = o ? b : a;
          for (let i = 0; i < Math.floor(gl / p); i++) for (let j = 0; j < Math.floor(gw / q); j++) out.push({ x: gx + i * p, y: gy + j * q, w: p, l: q });
        };
        if (ch[0] === 4) { grid(x, y, ch[1], w); grid(x + ch[1], y, l - ch[1], w); } else { grid(x, y, l, ch[1]); grid(x, y + ch[1], l, w - ch[1]); }
      } else if (ch[0] === 2) { place(ch[1], w, x, y, out); place(l - ch[1], w, x + ch[1], y, out); }
      else { place(l, ch[1], x, y, out); place(l, w - ch[1], x, y + ch[1], out); }
    }
    function P(L, W) {
      const k = L * 100000 + W;
      if (pin.has(k)) return pin.get(k);
      let best = G(L, W), cfg = null;
      const ub = Math.floor((L * W) / (a * b));
      const xs = combos.filter((c) => c > 0 && c < L), ys = combos.filter((c) => c > 0 && c < W);
      if (best < ub && ub <= 60 && xs.length * ys.length <= 900) {
        for (const x1 of xs) for (const x2 of xs) {
          if (x2 <= x1) continue;
          for (const y1 of ys) for (const y2 of ys) {
            if (y2 <= y1) continue;
            const v = G(x2, y1) + G(L - x2, y2) + G(L - x1, W - y2) + G(x1, W - y1) + G(x2 - x1, y2 - y1);
            if (v > best) { best = v; cfg = [x1, x2, y1, y2]; }
          }
          if (best >= ub) break;
        }
      }
      const r = { v: best, cfg };
      pin.set(k, r);
      return r;
    }
    function layout(L, W, usePin) {
      const out = [];
      const r = usePin ? P(L, W) : { v: G(L, W), cfg: null };
      if (r.cfg) {
        const [x1, x2, y1, y2] = r.cfg;
        place(x2, y1, 0, 0, out); place(L - x2, y2, x2, 0, out); place(L - x1, W - y2, x1, y2, out);
        place(x1, W - y1, 0, y1, out); place(x2 - x1, y2 - y1, x1, y1, out);
      } else place(L, W, 0, 0, out);
      return { count: r.v, rects: out, pinwheel: !!r.cfg };
    }
    pk = { count: (L, W, usePin) => (usePin ? P(L, W).v : G(L, W)), layout, combos };
    packers.set(key, pk);
    return pk;
  }

  function centerRects(rects, L, W) {
    if (!rects.length) return rects;
    let mx = 0, my = 0;
    for (const r of rects) { mx = Math.max(mx, r.x + r.w); my = Math.max(my, r.y + r.l); }
    const dx = Math.round((L - mx) / 2), dy = Math.round((W - my) / 2);
    return rects.map((r) => ({ x: r.x + dx, y: r.y + dy, w: r.w, l: r.l }));
  }

  // ---------- interlock ----------
  // Share of cartons in U resting on 2+ cartons of D (each overlap >= minOv of the carton base),
  // and how many cartons in U have less than 75% of their base supported.
  const sortedByX = new WeakMap();
  function tieStats(U, D, minOv) {
    const mo = minOv || 0.05;
    let Ds = sortedByX.get(D);
    if (!Ds) { Ds = D.slice().sort((p, q) => p.x - q.x); Ds.maxW = Math.max(0, ...D.map((d) => d.w)); sortedByX.set(D, Ds); }
    let tied = 0, unsupported = 0;
    for (const u of U) {
      const A = u.w * u.l;
      let n = 0, sup = 0;
      let lo = 0, hi = Ds.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (Ds[m].x + Ds.maxW <= u.x) lo = m + 1; else hi = m; }
      for (let i = lo; i < Ds.length && Ds[i].x < u.x + u.w; i++) {
        const d = Ds[i];
        const ox = Math.min(u.x + u.w, d.x + d.w) - Math.max(u.x, d.x);
        if (ox <= 0) continue;
        const oy = Math.min(u.y + u.l, d.y + d.l) - Math.max(u.y, d.y);
        if (oy <= 0) continue;
        const ov = ox * oy;
        sup += ov;
        if (ov >= mo * A) n++;
      }
      if (n >= 2) tied++;
      if (sup < 0.75 * A) unsupported++;
    }
    return { tie: U.length ? tied / U.length : 0, unsupported };
  }

  const patCache = new Map();
  function enumPatterns(L, W, fa, fb) {
    const a = Math.min(fa, fb), b = Math.max(fa, fb);
    const key = [L, W, a, b].join(',');
    if (patCache.has(key)) return patCache.get(key);
    const pk = getPacker(a, b);
    const best = pk.count(L, W, true);
    if (best === 0) { patCache.set(key, []); return []; }
    const minC = Math.max(1, best - 1);
    const big = best > 40;
    const thin = (arr, n) => (arr.length <= n ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / n) === 0));
    const xs = thin(pk.combos.filter((c) => c > 0 && c < L), big ? 30 : 24), ys = thin(pk.combos.filter((c) => c > 0 && c < W), big ? 30 : 24);
    const cnt = (w, l, o) => (o ? Math.floor(w / b) * Math.floor(l / a) : Math.floor(w / a) * Math.floor(l / b));
    const bestO = (w, l) => (cnt(w, l, 0) >= cnt(w, l, 1) ? 0 : 1);
    const specs = [];
    const push = (blocks) => {
      let c = 0;
      for (const bl of blocks) c += cnt(bl[2], bl[3], bl[4]);
      if (c >= minC) specs.push({ c, blocks });
    };
    const sideOpts = (x, y, w, l, alongY) => {
      const out = [[[x, y, w, l, 0]], [[x, y, w, l, 1]]];
      if (big) return out;
      const cuts = thin(alongY ? ys.filter((d) => d < l) : xs.filter((d) => d < w), 8); // nested splits: a coarse set of cut lines is enough
      for (const d of cuts) for (const o1 of [0, 1]) for (const o2 of [0, 1]) {
        out.push(alongY ? [[x, y, w, d, o1], [x, y + d, w, l - d, o2]] : [[x, y, d, l, o1], [x + d, y, w - d, l, o2]]);
      }
      return out;
    };
    for (const o of [0, 1]) push([[0, 0, L, W, o]]);
    for (const c of xs) { const left = sideOpts(0, 0, c, W, true), right = sideOpts(c, 0, L - c, W, true); for (const p of left) for (const q of right) push(p.concat(q)); }
    for (const d of ys) { const bot = sideOpts(0, 0, L, d, false), top = sideOpts(0, d, L, W - d, false); for (const p of bot) for (const q of top) push(p.concat(q)); }
    const px = thin(xs, 12), py = thin(ys, 12);
    if (!big) for (const x1 of px) for (const x2 of px) {
      if (x2 <= x1) continue;
      for (const y1 of py) for (const y2 of py) {
        if (y2 <= y1) continue;
        const bl = [[0, 0, x2, y1], [x2, 0, L - x2, y2], [x1, y2, L - x1, W - y2], [0, y1, x1, W - y1], [x1, y1, x2 - x1, y2 - y1]];
        push(bl.map((r) => r.concat([bestO(r[2], r[3])])));
      }
    }
    specs.sort((p, q) => q.c - p.c);
    const toRects = (blocks) => {
      const out = [];
      for (const [x, y, w, l, o] of blocks) {
        const p = o ? b : a, q = o ? a : b;
        const nx = Math.floor(w / p), ny = Math.floor(l / q);
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push({ x: x + i * p, y: y + j * q, w: p, l: q });
      }
      return out;
    };
    const canon = (rs) => rs.map((r) => r.x + ',' + r.y + ',' + r.w).sort().join(';');
    const seen = new Set(), base = [];
    const quota = new Map(big ? [[best, 2], [best - 1, 2]] : [[best, 6], [best - 1, 4]]);
    const add = (rs) => {
      const c = rs.length;
      if (!quota.get(c)) return;
      const cr = centerRects(rs, L, W), k = canon(cr);
      if (seen.has(k)) return;
      seen.add(k); base.push(cr); quota.set(c, quota.get(c) - 1);
    };
    add(pk.layout(L, W, true).rects);
    for (const s of specs) { if (!quota.get(best) && !quota.get(best - 1)) break; add(toRects(s.blocks)); }
    const out = [], seen2 = new Set();
    for (const rs of base) for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const v = rs.map((r) => ({ x: mx ? L - r.x - r.w : r.x, y: my ? W - r.y - r.l : r.y, w: r.w, l: r.l }));
      const k = canon(v);
      if (seen2.has(k)) continue;
      seen2.add(k); out.push(v);
    }
    patCache.set(key, out);
    return out;
  }

  // ---------- stacking ----------
  function layerTypes(dims, H, opts) {
    let axes = opts.upAxis != null ? [opts.upAxis] : [0, 1, 2];
    if (opts.allowAxes) axes = axes.filter((a) => opts.allowAxes.includes(a)); // product must stay upright
    const out = [], seenH = new Set();
    for (const ax of axes) {
      const h = dims[ax];
      if (seenH.has(h) || h > H) continue;
      seenH.add(h);
      out.push({ h, axis: ax, fp: dims.filter((_, i) => i !== ax) });
    }
    return out;
  }

  // free stacking: best count per layer type, then mix layer heights to fill the height
  function stackFree(dims, P, H, opts) {
    const t = layerTypes(dims, H, opts).map((x) => ({ ...x, cnt: getPacker(x.fp[0], x.fp[1]).count(P.L, P.W, true) })).filter((x) => x.cnt > 0);
    let best = null;
    const rec = (i, remH, ks) => {
      if (i === t.length) {
        let boxes = 0, built = 0;
        ks.forEach((k, j) => { boxes += k * t[j].cnt; built += k * t[j].h; });
        if (opts.maxBoxes && boxes > opts.maxBoxes) return;
        const used = ks.filter((k) => k > 0).length;
        if (!best || boxes > best.boxes || (boxes === best.boxes && (built < best.built || (built === best.built && used < best.used)))) best = { boxes, built, used, ks: ks.slice() };
        return;
      }
      for (let k = 0; k * t[i].h <= remH; k++) { ks[i] = k; rec(i + 1, remH - k * t[i].h, ks); }
      ks[i] = 0;
    };
    rec(0, H, new Array(t.length).fill(0));
    if (!best || !best.boxes) return { boxes: 0, built: 0, layers: [] };
    const order = t.map((x, j) => ({ ...x, k: best.ks[j] })).filter((x) => x.k > 0).sort((p, q) => q.k - p.k || q.cnt - p.cnt);
    const layers = [];
    for (const o of order) {
      const rects = centerRects(getPacker(o.fp[0], o.fp[1]).layout(P.L, P.W, true).rects, P.L, P.W);
      for (let i = 0; i < o.k; i++) layers.push({ h: o.h, cnt: o.cnt, axis: o.axis, fp: o.fp, rects, pid: 'f' + o.h + ':' + o.axis });
    }
    return { boxes: best.boxes, built: best.built, layers };
  }

  // brick wall: every layer must tie into the one below (DP over height left and last pattern)
  function stackBrick(dims, P, H, opts) {
    const pats = [];
    for (const ty of layerTypes(dims, H, opts)) {
      if (opts.upAxis == null && ty.h / Math.min(ty.fp[0], ty.fp[1]) >= 2.5) continue; // loose columns, not courses
      for (const rects of enumPatterns(P.L, P.W, ty.fp[0], ty.fp[1])) pats.push({ ...ty, cnt: rects.length, rects });
    }
    pats.sort((p, q) => q.cnt - p.cnt);
    const n = pats.length, thr = opts.brickMin;
    const okC = new Map();
    const ok = (up, dn) => {
      const k = up * 1024 + dn;
      let v = okC.get(k);
      if (v === undefined) { const s = tieStats(pats[up].rects, pats[dn].rects, opts.tieOverlap); v = s.tie >= thr && s.unsupported === 0; okC.set(k, v); }
      return v;
    };
    const memo = new Map(), budget = opts.maxBoxes || 0;
    const F = (remH, last, remB) => {
      const key = remH * 1024 + (last + 1) + (budget ? remB * 4194304 : 0);
      const hit = memo.get(key);
      if (hit) return hit;
      let best = { boxes: 0, built: 0, next: -1 };
      for (let p = 0; p < n; p++) {
        const pt = pats[p];
        if (pt.h > remH || (budget && pt.cnt > remB) || (last >= 0 && !ok(p, last))) continue;
        const r = F(remH - pt.h, p, remB - pt.cnt);
        const boxes = pt.cnt + r.boxes, built = pt.h + r.built;
        if (boxes > best.boxes || (boxes === best.boxes && built < best.built)) best = { boxes, built, next: p };
      }
      memo.set(key, best);
      return best;
    };
    const top = F(H, -1, budget);
    const layers = [];
    let remH = H, remB = budget, cur = top;
    while (cur.next >= 0) {
      const p = pats[cur.next];
      layers.push({ h: p.h, cnt: p.cnt, axis: p.axis, fp: p.fp, rects: p.rects, pid: 'b' + cur.next });
      remH -= p.h; remB -= p.cnt;
      cur = F(remH, cur.next, remB);
    }
    return { boxes: top.boxes, built: top.built, layers };
  }

  // ---------- carton construction ----------
  const perms3 = (d) => {
    const out = [], seen = new Set();
    for (const p of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      const v = p.map((i) => d[i]), k = v.join(',');
      if (!seen.has(k)) { seen.add(k); out.push(v); }
    }
    return out;
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  // Regular slotted carton: one board layer per side wall, two at the top and two at the bottom where the flaps overlap.
  function walls(prm, flap) {
    const t = prm.board.t / 10;
    return [0, 1, 2].map((i) => (i === flap ? 4 * t : 2 * t));
  }
  function outerOf(prm, inner, flap) { const w = walls(prm, flap); return inner.map((v, i) => r2(v + w[i])); }
  function cartonTare(prm, outer, flap) {
    const h = outer[flap], side = outer.filter((_, i) => i !== flap), L = Math.max(...side), W = Math.min(...side);
    return (((2 * L + 2 * W + 3.5) * (h + W)) / 10000) * prm.board.gsm; // RSC blank incl. 3.5 cm glue flap
  }
  function makeCarton(prm, arr, ori, flap, n) {
    const block = [arr[0] * ori[0], arr[1] * ori[1], arr[2] * ori[2]];
    const inner = block.map((v) => r2(v + prm.clearance));
    const outer = outerOf(prm, inner, flap);
    const count = n || arr[0] * arr[1] * arr[2];
    const tare = cartonTare(prm, outer, flap);
    return { n: count, arr, ori, flap, block, inner, outer, tare, kg: count * prm.unitKg + tare,
      cartonFill: (count * prm.unit[0] * prm.unit[1] * prm.unit[2]) / (outer[0] * outer[1] * outer[2]) };
  }
  // McKee short form: BCT = 5.87 x ECT x sqrt(caliper x perimeter), in N with ECT in N/m and lengths in m
  function bctN(prm, a, b) { return 5.87 * prm.board.ect * 1000 * Math.sqrt((prm.board.t / 1000) * ((2 * (a + b)) / 100)); }

  // ---------- one pallet scenario ----------
  const mm = (cm) => Math.round(cm * 10);
  const stackCache = new Map();
  function scenario(c, prm, pal, idx, opt) {
    const usable = prm.heightIncludesBase ? pal.H - prm.baseH : pal.H;
    const P = { L: mm(pal.L + 2 * prm.overhang), W: mm(pal.W + 2 * prm.overhang) };
    const dims = c.outer.map(mm);
    const maxBoxes = prm.maxPalletKg > 0 ? Math.max(0, Math.floor((prm.maxPalletKg - prm.palletTare) / c.kg)) : 0;
    // carton axes that may point up: with the product kept upright, only axes where the unit's height runs
    const allowAxes = prm.productUp && c.ori ? [0, 1, 2].filter((i) => c.ori[i] === prm.unit[2]) : null;
    const so = { upAxis: prm.upright ? c.flap : null, allowAxes, brickMin: prm.brickMin, tieOverlap: prm.tieOverlap, maxBoxes };
    // the same stack is asked for by the quick pass, the full pass and the board table, so keep it
    const sk = [dims.join('x'), P.L, P.W, mm(usable), prm.brick ? 1 : 0, so.upAxis, allowAxes ? allowAxes.join('') : '-', so.brickMin, so.tieOverlap, maxBoxes].join('|');
    let st = stackCache.get(sk);
    if (!st) {
      st = prm.brick ? stackBrick(dims, P, mm(usable), so) : stackFree(dims, P, mm(usable), so);
      if (stackCache.size > 4000) stackCache.clear();
      stackCache.set(sk, st);
    }
    const units = st.boxes * c.n, builtCm = st.built / 10;
    const uv = prm.unit[0] * prm.unit[1] * prm.unit[2];
    const res = { idx, pal, usable, boxes: st.boxes, units, builtCm, layers: st.layers, headroom: usable - builtCm,
      fillMax: units ? (units * uv) / (pal.L * pal.W * usable) : 0, fillBuilt: units ? (units * uv) / (pal.L * pal.W * builtCm) : 0 };
    if (opt && opt.light) return res;
    // interlock and floor use from the actual layer rectangles
    const A = mm(pal.L) * mm(pal.W);
    res.floor = st.layers.map((ly) => ly.rects.reduce((s, r) => s + r.w * r.l, 0) / A);
    res.floorAvg = res.floor.length ? res.floor.reduce((a, b) => a + b, 0) / res.floor.length : 0;
    res.floorMin = res.floor.length ? Math.min(...res.floor) : 0;
    let minTie = null;
    for (let i = 1; i < st.layers.length; i++) { const t = tieStats(st.layers[i].rects, st.layers[i - 1].rects, prm.tieOverlap).tie; minTie = minTie == null ? t : Math.min(minTie, t); }
    res.minTie = minTie;
    res.types = new Set(st.layers.map((l) => l.h + ':' + l.axis)).size;
    // weights and freight
    res.gross = st.boxes * c.kg + prm.palletTare;
    res.volKg = (pal.L * pal.W * (builtCm + prm.baseH)) / prm.divisor;
    res.chg = Math.max(res.gross, res.volKg);
    res.chgPerUnit = units ? res.chg / units : Infinity;
    res.costPerUnit = units && prm.rate > 0 ? (res.chg * prm.rate) / units : null;
    // compression: worst carton in any layer vs its estimated strength
    let worst = null;
    const extra = (prm.palletStack - 1) * res.gross; // pallets stacked on top in storage or transit
    for (let k = 0; k < st.layers.length; k++) {
      const ly = st.layers[k];
      let above = extra;
      for (let j = k + 1; j < st.layers.length; j++) above += st.layers[j].cnt * c.kg;
      const area = ly.rects.reduce((s, r) => s + r.w * r.l, 0);
      const share = (ly.rects[0].w * ly.rects[0].l) / area;
      const loadN = above * share * 9.81;
      const fp = ly.fp.map((v) => v / 10);
      let strength = bctN(prm, fp[0], fp[1]) * (ly.axis === c.flap ? 1 : prm.sideFactor);
      if (k < st.layers.length - 1 && st.layers[k + 1].pid !== ly.pid) strength *= prm.interlockKeep;
      const margin = loadN > 0 ? strength / (loadN * prm.sf) : Infinity;
      if (!worst || margin < worst.margin) worst = { layer: k, loadN, strength, needed: loadN * prm.sf, margin };
    }
    res.comp = worst;
    const flags = [];
    if (units && res.headroom < 1) flags.push('tight');
    if (res.types > 1) flags.push('mixed');
    if (st.layers.some((l) => l.axis !== c.flap)) flags.push('on side');
    res.flags = flags;
    return res;
  }

  function evalCarton(prm, c, light) {
    c.scen = prm.pallets.map((pal, i) => scenario(c, prm, pal, i, { light }));
    return c;
  }

  // tolerance check: same carton with every outside size larger by prm.tolerance
  function tolUnits(prm, c) {
    const c2 = Object.assign({}, c, { outer: c.outer.map((v) => v + prm.tolerance) });
    return prm.pallets.map((pal, i) => scenario(c2, prm, pal, i, { light: true }).units);
  }

  function run(prm) {
    const U = prm.unit, res = [], seen = new Map(), M = prm.maxPerAxis || 8;
    const flaps = prm.flapMode === 'auto' ? [0, 1, 2] : [2];
    for (let nx = 1; nx <= M; nx++) for (let ny = 1; ny <= M; ny++) for (let nz = 1; nz <= M; nz++) {
      const n = nx * ny * nz;
      if (n < prm.minUnits || n > prm.maxUnits) continue;
      for (const ori of perms3(U)) for (const flap of flaps) {
        if (prm.productUp && prm.upright && ori[flap] !== U[2]) continue; // unit height must run along the carton's up axis
        const c = makeCarton(prm, [nx, ny, nz], ori, flap);
        if (Math.max(...c.outer) > prm.maxSide || c.kg > prm.maxCartonKg) continue;
        const side = c.outer.filter((_, i) => i !== flap).sort((p, q) => q - p);
        const key = n + ':' + side.join('x') + '|' + c.outer[flap];
        if (seen.has(key)) continue;
        c.id = key; seen.set(key, c); res.push(c);
      }
    }
    // quick ranking with free stacking (cheap); the brick wall search runs only on the shortlist below
    const quick = Object.assign({}, prm, { brick: false });
    for (const c of res) evalCarton(quick, c, true);
    // full evaluation for the strongest candidates only, the rest keep the quick figures
    const score = (c) => c.scen.reduce((s, x) => s + x.units, 0);
    res.sort((p, q) => score(q) - score(p));
    const full = res.slice(0, prm.fullTop || 60);
    for (const c of full) { evalCarton(prm, c, false); c.tol = tolUnits(prm, c); }
    const loose = prm.pallets.map((pal, i) => {
      const lc = { n: 1, arr: [1, 1, 1], ori: U, flap: 2, outer: U.slice(), kg: prm.unitKg };
      return scenario(lc, Object.assign({}, prm, { brick: false, upright: false }), pal, i, { light: true }).units;
    });
    return { cartons: full, total: res.length, loose };
  }

  function evalArrangement(prm, arr, ori, flap) {
    const c = makeCarton(prm, arr, ori, flap);
    c.id = 'a:' + arr.join('x') + ':' + ori.join('x') + ':' + flap;
    evalCarton(prm, c, false);
    c.tol = tolUnits(prm, c);
    return c;
  }

  // your own carton by inside size: find how the units sit inside it
  function evalCustom(prm, inner, n, flap) {
    let best = null;
    for (const ori of perms3(prm.unit)) {
      if (prm.productUp && ori[flap] !== prm.unit[2]) continue; // keep the unit upright when the carton is upright
      const g = inner.map((v, i) => Math.floor((v + 1e-6) / ori[i]));
      const cap = g[0] * g[1] * g[2];
      if (cap >= n && (!best || cap < best.cap)) best = { ori, g, cap };
    }
    const outer = outerOf(prm, inner, flap);
    const tare = cartonTare(prm, outer, flap);
    const c = { id: 'custom', custom: true, n, flap, inner: inner.slice(), outer, tare, kg: n * prm.unitKg + tare,
      arr: best ? best.g : null, ori: best ? best.ori : null, fits: !!best, cap: best ? best.cap : 0,
      cartonFill: (n * prm.unit[0] * prm.unit[1] * prm.unit[2]) / (outer[0] * outer[1] * outer[2]) };
    if (best) c.block = best.g.map((v, i) => v * best.ori[i]);
    evalCarton(prm, c, false);
    c.tol = tolUnits(prm, c);
    return c;
  }

  // placements on the pallet in mm, origin at the pallet corner
  function placements(prm, sc) {
    const off = mm(prm.overhang), out = [];
    let z = 0;
    sc.layers.forEach((ly, li) => {
      for (const r of ly.rects) out.push({ x: r.x - off, y: r.y - off, z, w: r.w, l: r.l, h: ly.h, layer: li, axis: ly.axis });
      z += ly.h;
    });
    return out;
  }

  const api = { run, evalArrangement, evalCustom, placements, tieStats, bctN, walls, outerOf, makeCarton, mm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PalEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
