/* THERMOSCOPE shared experiment state: dataset access, cached design matrices, live fits, group cross-validation, official models. */
(function () {
  'use strict';
  const D = window.DATA, R = D.rows, N = R.fi.length, TS = window.TS = { D, N };
  TS.SWEEPS = 6000; TS.TARGETS = { Z: 'Compressibility factor Z', ar: 'Residual Helmholtz energy aʳ/RT', hr: 'Residual enthalpy hʳ/RT', sr: 'Residual entropy sʳ/R', gr: 'Residual Gibbs energy gʳ/RT', lnphi: 'ln φ, fugacity coefficient (extra target)' };
  TS.PH = ['Vapour', 'Liquid', 'Supercritical']; TS.PHRGB = [[255, 178, 74], [92, 198, 255], [199, 162, 255]]; TS.PHC = TS.PHRGB.map(c => 'rgb(' + c + ')');
  TS.MC = { ref: '#eef1f4', base: '#8a93a0', ols: '#ff6b3a', ridge: '#62dba6', lasso: '#f470b8' }; TS.MN = { base: 'Baseline (training mean)', ols: 'OLS', ridge: 'Ridge', lasso: 'Lasso' };
  TS.val = (i, t) => t === 'lnphi' ? R.lnphi[i] : t === 'Z' ? R.Z[i] : t === 'hr' ? R.hr[i] : t === 'sr' ? R.sr[i] : t === 'gr' ? R.hr[i] - R.sr[i] : R.hr[i] - R.sr[i] - (R.Z[i] - 1);
  TS.w = i => D.fluids[R.fi[i]].w; TS.F = idx => idx.map(i => [R.Tr[i], R.Pr[i], TS.w(i)]);
  TS.train = []; TS.test = []; for (let i = 0; i < N; i++) (D.fluids[R.fi[i]].test ? TS.test : TS.train).push(i);
  TS.foldOf = i => D.fluids[R.fi[i]].fold; TS.rowsOf = f => { const o = []; for (let i = 0; i < N; i++) if (R.fi[i] === f) o.push(i); return o; };
  TS.y = (idx, t) => Float64Array.from(idx, i => TS.val(i, t));
  const cache = {};
  // Design matrix for a row subset. std: centre and scale each column with THIS subset's mean and standard deviation, intercept handled by centring y.
  // raw: untouched columns plus a leading column of ones; nothing is centred.
  TS.prep = function (deg, raw, fold) {
    const key = deg + '|' + raw + '|' + fold; if (cache[key]) return cache[key];
    const idx = fold == null ? TS.train : TS.train.filter(i => TS.foldOf(i) !== fold), pw = ML.powers(deg), powers = raw ? [[0, 0, 0]].concat(pw) : pw, p = powers.length, n = idx.length;
    let X = ML.design(TS.F(idx), powers), m = null; if (!raw) { m = ML.moments(X, n, p); X = ML.apply(X, n, p, m); }
    const G = ML.gram(X, n, p), E = ML.eig(G, p); return (cache[key] = { deg, raw, idx, powers, p, n, X, m, G, E, names: powers.map(ML.featName) });
  };
  TS.fit = function (P, t, kind, lam, warm) {
    const y = TS.y(P.idx, t); let b0 = 0; if (!P.raw) { for (let i = 0; i < y.length; i++) b0 += y[i]; b0 /= y.length; for (let i = 0; i < y.length; i++) y[i] -= b0; }
    const key = 'b' + t; const b = P[key] || (P[key] = ML.xty(P.X, P.n, P.p, y));
    const beta = kind === 'base' ? new Float64Array(P.p) : kind === 'ols' ? ML.solveEig(P.E, b, 0) : kind === 'ridge' ? ML.solveEig(P.E, b, lam) : ML.lasso(P.G, b, P.n, lam, warm, TS.SWEEPS);
    if (kind === 'base' && P.raw) { beta[0] = TS.y(P.idx, t).reduce((a, c) => a + c, 0) / P.n; }
    return { beta, b0, P };
  };
  TS.transform = function (P, F) { let X = ML.design(F, P.powers); if (!P.raw) X = ML.apply(X, F.length, P.p, P.m); return X; };
  TS.predictRows = (M, idx) => ML.predict(TS.transform(M.P, TS.F(idx)), idx.length, M.P.p, M.beta, M.b0);
  TS.predictor = M => (Tr, Pr, w) => ML.predict(TS.transform(M.P, [[Tr, Pr, w]]), 1, M.P.p, M.beta, M.b0)[0];
  // Five-fold cross-validation grouped by fluid. Standardisation is refitted inside every training fold.
  const cvc = {};
  TS.cv = function (deg, raw, t, kind, lams) {
    const key = [deg, raw, t, kind, lams.join()].join('|'); if (cvc[key]) return cvc[key]; const out = lams.map(() => 0);
    for (let k = 0; k < 5; k++) {
      const P = TS.prep(deg, raw, k), va = TS.train.filter(i => TS.foldOf(i) === k), Xv = TS.transform(P, TS.F(va)), yv = TS.y(va, t); let warm = null;
      const order = kind === 'lasso' ? lams.map((_, i) => i).sort((a, b) => lams[b] - lams[a]) : lams.map((_, i) => i);
      order.forEach(i => { const M = TS.fit(P, t, kind, lams[i], warm); if (kind === 'lasso') warm = M.beta; out[i] += ML.err(yv, ML.predict(Xv, va.length, P.p, M.beta, M.b0)).rmse / 5; });
    }
    return (cvc[key] = out);
  };
  // Official models: fitted offline with scikit-learn on all training fluids, hyper-parameters chosen by grouped CV. Never refitted in the browser.
  TS.official = function (t, kind) {
    const g = D.reg, T = g.targets[t]; if (kind === 'base') return { f: () => T.base.pred, info: T.base };
    const m = T[kind], P = { powers: g.powers, p: g.powers.length, raw: false, m: { mean: g.mean, scale: g.scale } };
    return { f: TS.predictor({ P, beta: m.coef, b0: m.intercept }), info: m, P, M: { P, beta: m.coef, b0: m.intercept } };
  };
  TS.box = [{ pts: [[1, 0.03], [1, 1]], color: '#fff', width: 1.2, dash: [5, 4] }, { pts: [[0.6, 1], [1, 1]], color: '#fff', width: 1.2, dash: [5, 4] }]; // edges of the subcritical region
  TS.sat = function (w, n) { const o = []; for (let i = 0; i <= (n || 50); i++) { const Tr = 0.6 + 0.4 * i / (n || 50); o.push([Tr, Tr >= 1 ? 1 : ML.psat(Tr, w)]); } return o; };
  TS.fluidSelect = function (id, val, on) { const s = U.el('select', { class: 'inp', id, 'aria-label': 'Fluid', onchange: () => on(+s.value) }, ...D.fluids.map((f, i) => U.el('option', { value: i }, f.name + (f.test ? ' · held out' : '')))); s.value = val; return U.el('label', { class: 'field', for: id }, 'Fluid', s); };
  TS.targetSeg = (val, on) => U.seg(Object.keys(TS.TARGETS).map(k => [k, { Z: 'Z', ar: 'aʳ', hr: 'hʳ', sr: 'sʳ', gr: 'gʳ', lnphi: 'ln φ' }[k]]), val, on, 'Target');
  TS.key = items => U.el('div', { class: 'key', html: items.map(i => '<span><i style="background:' + i[1] + '"></i>' + i[0] + '</span>').join('') });
  TS.logSlider = function (o) { return U.slider({ label: o.label, min: o.min, max: o.max, step: o.step || 0.25, value: o.value, fmt: v => (o.pre || 'λ = ') + U.fmt(Math.pow(10, v), 3), on: v => o.on(Math.pow(10, v)) }); };
  TS.rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  TS.defaultFluid = Math.max(0, D.fluids.findIndex(f => f.name === 'Propane'));

  // 3D surface over the reduced state space: x = Tr (0.6..1.6), z = ln Pr (0.03..3), y = value.
  TS.NX = 56; TS.grid = i => 0.6 + i / (TS.NX - 1); TS.gridP = j => Math.exp(Math.log(0.03) + Math.log(100) * j / (TS.NX - 1));
  TS.surface = function (stage, o) {
    const T = THREE, n = TS.NX, g = new T.BufferGeometry(), pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setIndex(idx);
    o = Object.assign({}, o); const wire = o.wire; delete o.wire;
    const mesh = new T.Mesh(g, new T.MeshStandardMaterial(Object.assign({ vertexColors: true, side: T.DoubleSide, roughness: 0.42, metalness: 0.35 }, o))); stage.scene.add(mesh);
    if (wire) { const wm = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0x9fe8ff, wireframe: true, transparent: true, opacity: wire === true ? 0.16 : wire, depthWrite: false })); mesh.add(wm); mesh.wire = wm; }
    mesh.setData = function (vals, lo, hi, colorFn) { // vals: n*n values indexed [j*n+i]
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * n + i, k = a * 3, v = Math.min(hi, Math.max(lo, vals[a])); pos[k] = -1.7 + 3.4 * i / (n - 1); pos[k + 1] = 0.15 + 2.3 * (v - lo) / (hi - lo || 1); pos[k + 2] = 1.7 - 3.4 * j / (n - 1); const c = colorFn(i, j, vals[a]); col[k] = c[0] / 255; col[k + 1] = c[1] / 255; col[k + 2] = c[2] / 255; }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.computeVertexNormals();
    };
    mesh.at = (Tr, Pr, v, lo, hi) => new T.Vector3(-1.7 + 3.4 * (Tr - 0.6), 0.15 + 2.3 * (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1), 1.7 - 3.4 * Math.log(Pr / 0.03) / Math.log(100)); return mesh;
  };
  // Particle cloud (state points). set(i, Vector3-like xyz, rgb 0-255) then commit().
  TS.cloud = function (stage, n, size) {
    const T = THREE, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const pts = new T.Points(g, new T.PointsMaterial({ size: size || 0.07, map: new T.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true })); pts.frustumCulled = false; stage.scene.add(pts);
    return { points: pts, n, set(i, p, c, dim) { const k = i * 3, d = (dim == null ? 1 : dim) / 255; pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z; col[k] = c[0] * d; col[k + 1] = c[1] * d; col[k + 2] = c[2] * d; }, commit() { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; } };
  };
  TS.xyz = (Tr, Pr, y) => ({ x: -1.7 + 3.4 * (Tr - 0.6), y, z: 1.7 - 3.4 * Math.log(Pr / 0.03) / Math.log(100) });
  TS.phaseKey = extra => TS.key([['● Vapour', TS.PHC[0]], ['■ Liquid', TS.PHC[1]], ['▲ Supercritical', TS.PHC[2]]].concat(extra || []));
  // Static 2D stand-in when WebGL is unavailable: the reference Z field of one fluid, shaded by value and coloured by phase.
  TS.fallback = function (w, t) { return function (container) {
    const cv = U.el('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;cursor:default', role: 'img', 'aria-label': 'Static map of the reference surface over reduced temperature and pressure' }), n = 120; cv.width = cv.height = n; const x = cv.getContext('2d'), im = x.createImageData(n, n); let lo = 1e9, hi = -1e9; const v = new Float64Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const q = ML.pr(0.6 + i / (n - 1), 0.03 * Math.pow(100, 1 - j / (n - 1)), w)[t || 'Z']; v[j * n + i] = q; lo = Math.min(lo, q); hi = Math.max(hi, q); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const c = TS.PHRGB[ML.phase(0.6 + i / (n - 1), 0.03 * Math.pow(100, 1 - j / (n - 1)), w)], a = 0.25 + 0.75 * (v[j * n + i] - lo) / (hi - lo || 1), k = (j * n + i) * 4; im.data[k] = c[0] * a; im.data[k + 1] = c[1] * a; im.data[k + 2] = c[2] * a; im.data[k + 3] = 255; } x.putImageData(im, 0, 0);
    container.prepend(cv); container.append(U.el('div', { class: 'hint', style: 'right:14px' }, 'Static map (3D needs WebGL): brightness = ' + (t || 'Z') + ', colour = phase, Tr → right, Pr ↑')); return null; }; };
  TS.axes = function (stage, zl) { const T = THREE; stage.annotate(new T.Vector3(1.9, 0.1, 1.75), 'Tr →'); stage.annotate(new T.Vector3(-1.75, 0.1, -1.9), 'Pr (log) →'); return stage.annotate(new T.Vector3(-1.75, 2.6, 1.75), zl); };
  TS.field = function (w, t, f) { const n = TS.NX, v = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = f(TS.grid(i), TS.gridP(j), w); return v; };
  TS.refField = (w, t) => TS.field(w, t, (Tr, Pr) => ML.pr(Tr, Pr, w)[t]);
})();
