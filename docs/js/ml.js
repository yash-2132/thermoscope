/* THERMOSCOPE numerical core (browser side). Everything here is a real calculation:
   Peng-Robinson reference in reduced variables, polynomial design matrices, Gram matrices, symmetric eigen-solver,
   OLS / Ridge / Lasso solvers, RBF-SVM and logistic-regression evaluation, classification metrics. */
(function (g) {
  'use strict';
  const S2 = Math.SQRT2, ML = {};
  function cubicReal(a2, a1, a0) {
    const p = a1 - a2 * a2 / 3, q = 2 * a2 * a2 * a2 / 27 - a2 * a1 / 3 + a0, D = q * q / 4 + p * p * p / 27;
    if (D > 0) { const s = Math.sqrt(D); return [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) - a2 / 3]; }
    const m = 2 * Math.sqrt(-p / 3), th = Math.acos(Math.max(-1, Math.min(1, 3 * q / (p * m)))) / 3;
    return [0, 1, 2].map(i => m * Math.cos(th - 2 * Math.PI * i / 3) - a2 / 3).sort((x, y) => x - y);
  }
  // Peng-Robinson (1976) in reduced variables. Residual properties are relative to the ideal gas at the same T and P, made dimensionless with RT (or R).
  // Residual properties use the CoolProp / Helmholtz convention (same temperature and density), dimensionless:
  // ar = a^r/RT, hr = h^r/RT, sr = s^r/R, gr = g^r/RT = hr - sr = ar + Z - 1. lnphi = gr - ln Z is the fugacity coefficient.
  ML.prRoots = function (Tr, Pr, w) {
    const kap = 0.37464 + 1.54226 * w - 0.26992 * w * w, sa = 1 + kap * (1 - Math.sqrt(Tr)), al = sa * sa;
    const A = 0.45724 * al * Pr / (Tr * Tr), B = 0.07780 * Pr / Tr, D = -kap * Math.sqrt(Tr) / sa;
    return cubicReal(-(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B * B * B)).filter(Z => Z > B).map(Z => {
      const L = Math.log((Z + (1 + S2) * B) / (Z + (1 - S2) * B)), lnphi = Z - 1 - Math.log(Z - B) - A / (2 * S2 * B) * L;
      const hr = Z - 1 + (A / B) * (D - 1) / (2 * S2) * L, gr = lnphi + Math.log(Z);
      return { Z, gr, hr, sr: hr - gr, ar: gr - (Z - 1), lnphi };
    });
  };
  ML.pr = function (Tr, Pr, w) { const r = ML.prRoots(Tr, Pr, w); return r.length > 1 && r[r.length - 1].lnphi < r[0].lnphi ? r[r.length - 1] : r[0]; };
  const psc = {};
  ML.psat = function (Tr, w) { // reduced saturation pressure from equal fugacity
    if (Tr >= 1) return NaN; const key = w + '|' + Tr.toFixed(4); if (key in psc) return psc[key];
    let lo = 1e-8, hi = 1;
    for (let i = 0; i < 70; i++) { const P = Math.sqrt(lo * hi), r = ML.prRoots(Tr, P, w); if (r.length < 2) { if (r[0].Z < 0.3 && P > 1e-3) hi = P; else lo = P; continue; } if (r[0].lnphi - r[r.length - 1].lnphi > 0) lo = P; else hi = P; }
    return (psc[key] = Math.sqrt(lo * hi));
  };
  // CoolProp phase regions grouped into three classes: gas -> 0 vapour; liquid -> 1; supercritical, supercritical_gas, supercritical_liquid -> 2.
  ML.phase = function (Tr, Pr, w) { if (Tr >= 1 || Pr >= 1) return 2; return Pr > ML.psat(Tr, w) ? 1 : 0; };
  ML.target = (st, t) => st[t];

  /* ---- polynomial features (same ordering as scikit-learn PolynomialFeatures, include_bias = false) ---- */
  ML.powers = function (deg, nf) {
    nf = nf || 3; const out = [];
    const rec = (start, left, cur) => { if (!left) { const p = new Array(nf).fill(0); cur.forEach(i => p[i]++); out.push(p); return; } for (let i = start; i < nf; i++) rec(i, left - 1, cur.concat(i)); };
    for (let d = 1; d <= deg; d++) rec(0, d, []); return out;
  };
  const NAMES = ['Tr', 'Pr', 'ω'], SUPS = '⁰¹²³⁴⁵⁶⁷';
  ML.featName = p => p.map((e, i) => e ? NAMES[i] + (e > 1 ? SUPS[e] : '') : '').filter(Boolean).join('·') || '1';
  ML.design = function (F, powers) { // F: array of [Tr, Pr, w]; returns raw n x p row-major
    const n = F.length, p = powers.length, X = new Float64Array(n * p);
    for (let i = 0; i < n; i++) { const f = F[i]; for (let j = 0; j < p; j++) { const e = powers[j]; let v = 1; for (let k = 0; k < f.length; k++) for (let q = 0; q < e[k]; q++) v *= f[k]; X[i * p + j] = v; } }
    return X;
  };
  ML.moments = function (X, n, p) { const mean = new Float64Array(p), scale = new Float64Array(p); for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) mean[j] += X[i * p + j]; for (let j = 0; j < p; j++) mean[j] /= n; for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) { const d = X[i * p + j] - mean[j]; scale[j] += d * d; } for (let j = 0; j < p; j++) scale[j] = Math.sqrt(scale[j] / n) || 1; return { mean, scale }; };
  ML.apply = function (X, n, p, m) { const Y = new Float64Array(n * p); for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) Y[i * p + j] = (X[i * p + j] - m.mean[j]) / m.scale[j]; return Y; };
  ML.gram = function (X, n, p) { const G = new Float64Array(p * p); for (let i = 0; i < n; i++) { const o = i * p; for (let a = 0; a < p; a++) { const xa = X[o + a]; if (xa === 0) continue; for (let b = a; b < p; b++) G[a * p + b] += xa * X[o + b]; } } for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) G[a * p + b] = G[b * p + a]; return G; };
  ML.xty = function (X, n, p, y) { const b = new Float64Array(p); for (let i = 0; i < n; i++) { const yi = y[i], o = i * p; for (let j = 0; j < p; j++) b[j] += X[o + j] * yi; } return b; };
  // Cyclic Jacobi eigen-decomposition of a symmetric matrix. Returns eigenvalues (descending) and eigenvectors as columns of V.
  ML.eig = function (A, p) {
    const a = Float64Array.from(A), V = new Float64Array(p * p); for (let i = 0; i < p; i++) V[i * p + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += a[i * p + j] * a[i * p + j]; if (off < 1e-28) break;
      for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
        const aij = a[i * p + j]; if (Math.abs(aij) < 1e-300) continue; const th = (a[j * p + j] - a[i * p + i]) / (2 * aij), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < p; k++) { const ki = a[k * p + i], kj = a[k * p + j]; a[k * p + i] = c * ki - s * kj; a[k * p + j] = s * ki + c * kj; }
        for (let k = 0; k < p; k++) { const ik = a[i * p + k], jk = a[j * p + k]; a[i * p + k] = c * ik - s * jk; a[j * p + k] = s * ik + c * jk; }
        for (let k = 0; k < p; k++) { const ki = V[k * p + i], kj = V[k * p + j]; V[k * p + i] = c * ki - s * kj; V[k * p + j] = s * ki + c * kj; }
      }
    }
    const idx = Array.from({ length: p }, (_, i) => i).sort((x, y) => a[y * p + y] - a[x * p + x]);
    return { val: idx.map(i => a[i * p + i]), vec: idx.map(i => { const v = new Float64Array(p); for (let k = 0; k < p; k++) v[k] = V[k * p + i]; return v; }) };
  };
  // Solve (G + lam I) beta = b through the eigen-decomposition; lam = 0 gives minimum-norm least squares with a relative cut-off.
  ML.solveEig = function (E, b, lam, rcond) { const p = b.length, beta = new Float64Array(p), cut = (rcond || 1e-13) * E.val[0]; for (let i = 0; i < p; i++) { const d = E.val[i] + lam; if (d <= cut) continue; const v = E.vec[i]; let c = 0; for (let k = 0; k < p; k++) c += v[k] * b[k]; c /= d; for (let k = 0; k < p; k++) beta[k] += c * v[k]; } return beta; };
  // Lasso by coordinate descent on the Gram matrix: minimise (1/2n)||y - X beta||^2 + alpha ||beta||_1
  ML.lasso = function (G, b, n, alpha, warm, maxSweep) {
    const p = b.length, beta = warm ? Float64Array.from(warm) : new Float64Array(p), thr = n * alpha; let sweeps = 0, conv = false;
    for (; sweeps < (maxSweep || 1500); sweeps++) {
      let dmax = 0, bmax = 0;
      for (let j = 0; j < p; j++) { let rho = b[j]; const o = j * p; for (let k = 0; k < p; k++) if (k !== j && beta[k] !== 0) rho -= G[o + k] * beta[k]; const nb = rho > thr ? (rho - thr) / G[o + j] : rho < -thr ? (rho + thr) / G[o + j] : 0, d = Math.abs(nb - beta[j]); if (d > dmax) dmax = d; if (Math.abs(nb) > bmax) bmax = Math.abs(nb); beta[j] = nb; }
      if (dmax <= 1e-7 * (bmax || 1)) { conv = true; break; }
    }
    beta.sweeps = sweeps; beta.converged = conv; return beta;
  };
  ML.predict = function (X, n, p, beta, b0) { const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b0; const o = i * p; for (let j = 0; j < p; j++) s += X[o + j] * beta[j]; y[i] = s; } return y; };
  ML.err = function (y, yh) { let se = 0, ae = 0, m = 0; const n = y.length; for (let i = 0; i < n; i++) { const d = y[i] - yh[i]; se += d * d; ae += Math.abs(d); m += y[i]; } m /= n; let st = 0; for (let i = 0; i < n; i++) st += (y[i] - m) * (y[i] - m); return { sse: se, rmse: Math.sqrt(se / n), mae: ae / n, r2: 1 - se / st }; };

  /* ---- classifiers exported from scikit-learn, evaluated exactly ---- */
  ML.clsFeat = (Tr, Pr, w, m) => [(Tr - m.mean[0]) / m.scale[0], (Math.log(Pr) - m.mean[1]) / m.scale[1], (w - m.mean[2]) / m.scale[2]];
  ML.lrProba = function (m, Tr, Pr, w) { const x = ML.clsFeat(Tr, Pr, w, m), z = m.coef.map((c, k) => c[0] * x[0] + c[1] * x[1] + c[2] * x[2] + m.intercept[k]), mx = Math.max(...z), e = z.map(v => Math.exp(v - mx)), s = e[0] + e[1] + e[2]; return e.map(v => v / s); };
  ML.svmDecide = function (m, Tr, Pr, w) { // libsvm one-vs-one: returns {cls, votes, dec:[01,02,12]}
    const x = ML.clsFeat(Tr, Pr, w, m), sv = m.sv, n = sv.length, K = m._K || (m._K = new Float64Array(n));
    for (let i = 0; i < n; i++) { const s = sv[i], a = s[0] - x[0], b = s[1] - x[1], c = s[2] - x[2]; K[i] = Math.exp(-m.gamma * (a * a + b * b + c * c)); }
    const st = [0, m.nsv[0], m.nsv[0] + m.nsv[1]], votes = [0, 0, 0], dec = []; let q = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { let s = m.intercept[q]; for (let k = 0; k < m.nsv[i]; k++) s += m.dual[j - 1][st[i] + k] * K[st[i] + k]; for (let k = 0; k < m.nsv[j]; k++) s += m.dual[i][st[j] + k] * K[st[j] + k]; dec.push(s); votes[s > 0 ? i : j]++; q++; }
    let cls = 0; for (let k = 1; k < 3; k++) if (votes[k] > votes[cls]) cls = k; return { cls, votes, dec };
  };
  ML.binaryStats = function (y, score, thr) { let tp = 0, fp = 0, tn = 0, fn = 0; for (let i = 0; i < y.length; i++) { const pos = score[i] >= thr; if (y[i]) pos ? tp++ : fn++; else pos ? fp++ : tn++; } return { tp, fp, tn, fn, tpr: tp / (tp + fn || 1), fpr: fp / (fp + tn || 1), prec: tp / (tp + fp || 1) }; };
  g.ML = ML; if (typeof module !== 'undefined') module.exports = ML;
})(typeof window !== 'undefined' ? window : globalThis);
