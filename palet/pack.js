/* Motor de cálculo de cajas por palet. Medidas en milímetros enteros.
   Reparte rectángulos (la huella de la caja) en el rectángulo del palet con cortes de guillotina
   sobre posiciones "normales" (combinaciones de largo y ancho de la caja). Es exacto para estos patrones
   y casi siempre iguala al óptimo real. */
(function (root) {
  'use strict';
  const EPS = 1e-6;

  function normalSet(max, a, b) {
    const s = new Set([0]);
    for (let i = 0; i * a <= max + EPS; i++) {
      for (let j = 0; i * a + j * b <= max + EPS; j++) s.add(i * a + j * b);
    }
    return Array.from(s).sort((x, y) => x - y);
  }

  function floorIdx(arr, v) {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= v + EPS) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Mejor reparto uniforme (todas las cajas con la misma orientación).
  function uniform(L, W, l, w, rot) {
    const a = { nx: Math.floor(L / l), ny: Math.floor(W / w), r: 0 }; a.n = a.nx * a.ny;
    let best = a;
    if (rot) {
      const b = { nx: Math.floor(L / w), ny: Math.floor(W / l), r: 1 }; b.n = b.nx * b.ny;
      if (b.n > a.n) best = b;
    }
    return best;
  }

  function rectsUniform(L, W, l, w, u) {
    const out = [], bw = u.r ? w : l, bh = u.r ? l : w;
    for (let i = 0; i < u.nx; i++) for (let j = 0; j < u.ny; j++) out.push({ x: i * bw, y: j * bh, w: bw, h: bh, r: u.r });
    return out;
  }

  /* Devuelve { n, rects:[{x,y,w,h,r}], uniform:{nx,ny,r,n}, exact:boolean } */
  function pack(L, W, l, w, rot) {
    L = Math.round(L); W = Math.round(W); l = Math.ceil(l - EPS); w = Math.ceil(w - EPS);
    const u = uniform(L, W, l, w, rot);
    if (u.n === 0 && !(rot ? (l <= W && w <= L) || (l <= L && w <= W) : (l <= L && w <= W))) {
      return { n: 0, rects: [], uniform: u, exact: true };
    }
    const px = normalSet(L, l, w), py = normalSet(W, l, w);
    const nx = px.length, ny = py.length;
    if (nx * ny > 70000) { // demasiado fino: reparto uniforme
      return { n: u.n, rects: rectsUniform(L, W, l, w, u), uniform: u, exact: false };
    }
    const val = new Int32Array(nx * ny).fill(-1), typ = new Uint8Array(nx * ny), arg = new Int32Array(nx * ny);

    function f(xi, yi) {
      const k = xi * ny + yi;
      if (val[k] >= 0) return val[k];
      const X = px[xi], Y = py[yi];
      let best = 0, t = 0, a = 0;
      const c1 = Math.floor((X + EPS) / l) * Math.floor((Y + EPS) / w);
      if (c1 > best) { best = c1; t = 1; }
      if (rot) {
        const c2 = Math.floor((X + EPS) / w) * Math.floor((Y + EPS) / l);
        if (c2 > best) { best = c2; t = 2; }
      }
      const ub = Math.floor(X * Y / (l * w) + 1e-9);
      if (best < ub) {
        for (let ci = 1; ci < xi && px[ci] * 2 <= X + EPS; ci++) {
          const r = floorIdx(px, X - px[ci]);
          const cand = f(ci, yi) + f(r, yi);
          if (cand > best) { best = cand; t = 3; a = ci; if (best >= ub) break; }
        }
        if (best < ub) {
          for (let cj = 1; cj < yi && py[cj] * 2 <= Y + EPS; cj++) {
            const r = floorIdx(py, Y - py[cj]);
            const cand = f(xi, cj) + f(xi, r);
            if (cand > best) { best = cand; t = 4; a = cj; if (best >= ub) break; }
          }
        }
      }
      val[k] = best; typ[k] = t; arg[k] = a;
      return best;
    }

    function build(xi, yi, ox, oy, out) {
      const k = xi * ny + yi, t = typ[k], X = px[xi], Y = py[yi];
      if (t === 1) {
        const cols = Math.floor((X + EPS) / l), rows = Math.floor((Y + EPS) / w);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push({ x: ox + i * l, y: oy + j * w, w: l, h: w, r: 0 });
      } else if (t === 2) {
        const cols = Math.floor((X + EPS) / w), rows = Math.floor((Y + EPS) / l);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push({ x: ox + i * w, y: oy + j * l, w: w, h: l, r: 1 });
      } else if (t === 3) {
        const ci = arg[k], r = floorIdx(px, X - px[ci]);
        build(ci, yi, ox, oy, out); build(r, yi, ox + px[ci], oy, out);
      } else if (t === 4) {
        const cj = arg[k], r = floorIdx(py, Y - py[cj]);
        build(xi, cj, ox, oy, out); build(xi, r, ox, oy + py[cj], out);
      }
    }

    const n = f(nx - 1, ny - 1);
    const rects = []; build(nx - 1, ny - 1, 0, 0, rects);
    return { n, rects, uniform: u, exact: true };
  }

  /* Comprobación: ninguna caja se sale del palet ni se solapa con otra. */
  function validate(L, W, rects) {
    for (const r of rects) if (r.x < -EPS || r.y < -EPS || r.x + r.w > L + EPS || r.y + r.h > W + EPS) return false;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS) return false;
    }
    return true;
  }

  /* Cálculo completo: orientación de la caja, capas, total, pesos y medidas. */
  function calculate(o) {
    const dims = [o.l, o.w, o.h];
    const options = o.anyFace
      ? [[dims[0], dims[1], dims[2]], [dims[0], dims[2], dims[1]], [dims[1], dims[2], dims[0]]]
      : [[dims[0], dims[1], dims[2]]];
    const usable = o.maxH - o.palletH;
    let best = null;
    options.forEach((d, idx) => {
      const [l, w, h] = d;
      const layers = h > 0 ? Math.floor((usable + EPS) / h) : 0;
      const p = pack(o.L, o.W, l, w, o.rotate);
      const perLayerGeom = p.n;
      const geom = perLayerGeom * layers;
      const cand = { idx, l, w, h, layers, p, perLayerGeom, geom };
      if (!best || geom > best.geom) best = cand;
    });
    const maxByWeight = o.boxKg > 0 ? Math.floor((o.maxPayload + EPS) / o.boxKg) : Infinity;
    const total = Math.min(best.geom, maxByWeight);
    const perLayer = best.perLayerGeom;
    const fullLayers = perLayer ? Math.floor(total / perLayer) : 0;
    const rest = perLayer ? total - fullLayers * perLayer : 0;
    const usedLayers = fullLayers + (rest ? 1 : 0);
    const rects = best.p.rects;
    const bbL = rects.length ? Math.max.apply(null, rects.map(r => r.x + r.w)) : 0;
    const bbW = rects.length ? Math.max.apply(null, rects.map(r => r.y + r.h)) : 0;
    const loadH = o.palletH + usedLayers * best.h;
    const netKg = total * o.boxKg;
    return {
      best, perLayer, layers: best.layers, geom: best.geom, total, fullLayers, rest, usedLayers,
      limitedByWeight: total < best.geom, maxByWeight,
      bbL, bbW, loadH, netKg, grossKg: netKg + o.palletKg,
      areaPct: o.L * o.W ? (perLayer * best.l * best.w) / (o.L * o.W) * 100 : 0,
      volPct: (total && o.L * o.W * (loadH - o.palletH)) ? (total * best.l * best.w * best.h) / (o.L * o.W * (loadH - o.palletH)) * 100 : 0,
      volM3: bbL * bbW * loadH / 1e9
    };
  }

  const api = { pack, uniform, validate, calculate, normalSet };
  root.Pack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
