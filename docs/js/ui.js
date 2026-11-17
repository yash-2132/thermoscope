/* Heatwork UI kit: DOM helpers, controls, plots, equations, quizzes, progress, router. */
(function () {
  'use strict';
  const U = window.U = {};
  let uid = 0;
  U.el = function (tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  };
  const el = U.el;
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  U.fmt = function (x, sig) {
    if (x == null || !isFinite(x)) return '—'; sig = sig || 4; const a = Math.abs(x);
    if (a === 0) return '0';
    if (a >= 1e6 || a < 1e-3) { const [m, e] = x.toExponential(sig - 2).split('e'); return m + '×10' + String(+e).split('').map(c => SUP[c]).join(''); }
    let s = x.toPrecision(sig); if (s.includes('.') && !s.includes('e')) s = s.replace(/\.?0+$/, ''); return String(+s === 0 ? 0 : s.includes('e') ? +s : s);
  };
  // Tiny equation markup: _{..} ^{..} \frac{a}{b}
  U.eq = function (s) {
    let p; do { p = s; s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="fr"><span>$1</span><span>$2</span></span>').replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>'); } while (p !== s);
    return s.replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>').replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>');
  };
  U.m = s => '<span class="m">' + U.eq(s) + '</span>';
  U.eqBlock = (s, note) => '<div class="eq">' + U.eq(s) + (note ? '<small>' + U.eq(note) + '</small>' : '') + '</div>';

  /* ---- persistence (one viewer, best effort) ---- */
  const mem = {};
  U.store = {
    get(k, d) { try { const v = localStorage.getItem('hw.' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('hw.' + k, JSON.stringify(v)); } catch (e) { } }
  };
  U.progress = {
    data() { return U.store.get('progress', { seen: {}, quiz: {}, chal: {} }); },
    mark(kind, id, val) { const d = this.data(); d[kind][id] = val === undefined ? true : val; U.store.set('progress', d); U.refreshChrome(); },
    chapterDone(id) { const d = this.data(), q = d.quiz[id]; return !!(d.seen[id] && q && q.right >= Math.ceil(q.total * 0.6)); },
    pct() { const ch = U.chapters; return ch.length ? ch.filter(c => this.chapterDone(c.id)).length / ch.length : 0; }
  };
  U.toast = function (t) { const e = el('div', { class: 'toast', role: 'status' }, t); document.body.append(e); setTimeout(() => e.remove(), 2600); };

  /* ---- view lifecycle ---- */
  let cleaners = [];
  U.onLeave = fn => cleaners.push(fn);
  U.loop = function (fn) {
    let id, last = performance.now(), on = true;
    const tick = t => { if (!on) return; const dt = Math.min(0.05, (t - last) / 1000); last = t; if (!document.hidden) fn(dt, t / 1000); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick); const stop = () => { on = false; cancelAnimationFrame(id); }; U.onLeave(stop); return stop;
  };
  U.reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- controls ---- */
  U.slider = function (o) {
    const id = 'c' + (++uid), out = el('output', { for: id }), inp = el('input', { type: 'range', id, min: o.min, max: o.max, step: o.step || 1, value: o.value });
    const show = () => { out.textContent = (o.fmt ? o.fmt(+inp.value) : U.fmt(+inp.value)) + (o.unit ? ' ' + o.unit : ''); };
    inp.addEventListener('input', () => { show(); o.on && o.on(+inp.value); }); show();
    const node = el('div', { class: 'ctl' }, el('label', { for: id, html: U.eq(String(o.label)) }), out, inp);
    return { el: node, get value() { return +inp.value; }, set(v) { inp.value = v; show(); }, input: inp };
  };
  U.seg = function (opts, value, on, label) {
    const node = el('div', { class: 'seg', role: 'group', 'aria-label': label || 'options' });
    const set = v => { [...node.children].forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); };
    opts.forEach(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; node.append(el('button', { type: 'button', 'data-v': v, html: U.eq(String(t)), onclick: () => { set(v); on(v); } })); });
    set(value); node.set = set; return node;
  };
  U.readout = function (items) {
    const node = el('div', { class: 'rd' }), map = {};
    items.forEach(it => { const b = el('b', {}, '—'); map[it.k] = { b, it }; node.append(el('div', {}, el('small', { html: U.eq(it.label) }), b, it.unit ? el('i', {}, it.unit) : null)); });
    node.set = vals => { for (const k in vals) if (map[k]) { const v = vals[k]; map[k].b.textContent = typeof v === 'string' ? v : U.fmt(v, map[k].it.sig || 4); } };
    return node;
  };
  U.grp = (title, ...kids) => el('div', { class: 'grp' }, title ? el('h4', {}, title) : null, ...kids);
  U.hold = function (label, cls, on) { // press-and-hold button; on(true/false)
    const b = el('button', { type: 'button', class: 'btn ' + (cls || '') }, label);
    const dn = e => { e.preventDefault(); b.classList.add('act'); on(true); }, up = () => { if (b.classList.contains('act')) { b.classList.remove('act'); on(false); } };
    b.addEventListener('pointerdown', dn); ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => b.addEventListener(ev, up));
    b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) dn(e); }); b.addEventListener('keyup', up);
    return b;
  };
  U.bench = function (o) {
    o = o || {}; const stage = o.noStage ? null : el('div', { class: 'stage' }), side = el('div', { class: 'side' }), below = el('div', { class: 'below' });
    const node = el('div', { class: 'bench' + (o.noStage ? ' flat' : '') }, el('div', { class: 'top' }, stage, side), below, o.assume ? el('div', { class: 'assume', html: '<b>Model</b>' + U.eq(o.assume) }) : null);
    if (o.noStage) side.style.borderLeft = '0';
    return { node, stage, side, below };
  };

  /* ---- plot ---- */
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  U.col = { get hot() { return css('--hot'); }, get warm() { return css('--warm'); }, get cold() { return css('--cold'); }, get ink() { return css('--ink'); }, get mute() { return css('--mute'); }, get ok() { return css('--ok'); }, get dim() { return css('--dim'); } };
  function nice(span) { const p = Math.pow(10, Math.floor(Math.log10(span))), f = span / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  U.Plot = class {
    constructor(parent, o) {
      this.o = Object.assign({ h: 280, xlabel: '', ylabel: '', title: '' }, o); this.d = { series: [], points: [] };
      this.cv = el('canvas', { role: 'img', 'aria-label': (this.o.title || 'Chart') + (this.o.ylabel ? ': ' + this.o.ylabel + ' against ' + this.o.xlabel : '') }); this.info = el('span', { class: 'pinfo' }, '');
      this.ttl = el('span', {}, this.o.title);
      this.node = el('div', { class: 'plot' }, el('div', { class: 'ttl' }, this.ttl), el('div', { class: 'axl' }, el('span', {}, this.o.ylabel ? '↑ ' + this.o.ylabel : ''), this.info), this.cv, el('div', { class: 'axl x' }, el('span', {}, this.o.xlabel ? this.o.xlabel + ' →' : '')));
      parent.append(this.node); this.cv.style.height = this.o.h + 'px';
      const ro = new ResizeObserver(() => this.draw()); ro.observe(this.cv); U.onLeave(() => ro.disconnect());
      this.cv.addEventListener('click', e => { if (!this.o.onClick || !this.inv) return; const r = this.cv.getBoundingClientRect(), v = this.inv(e.clientX - r.left, e.clientY - r.top); this.o.onClick(v[0], v[1]); });
      if (this.o.onClick) this.cv.style.cursor = 'crosshair';
      this.cv.addEventListener('pointermove', e => { const r = this.cv.getBoundingClientRect(); this.hover = [e.clientX - r.left, e.clientY - r.top]; this.draw(); });
      this.cv.addEventListener('pointerleave', () => { this.hover = null; this.info.textContent = ''; this.draw(); });
    }
    set(d) { this.d = Object.assign({ series: [], points: [] }, d); this.draw(); }
    draw() {
      const cv = this.cv, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      const dpr = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const o = this.o, d = this.d, Rr = 14, T = 10, B = 24, C = U.col, mono = css('--mono');
      const all = d.series.flatMap(s => s.pts || []).concat(d.points.map(p => [p.x, p.y])).filter(p => isFinite(p[0]) && isFinite(p[1]) && (!o.xlog || p[0] > 0) && (!o.ylog || p[1] > 0));
      if (!all.length && !(d.xr || o.xr)) return;
      const rng = (i, fix, lg) => {
        if (fix) return fix.slice(); let lo = Infinity, hi = -Infinity; all.forEach(p => { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); });
        if (lg) return [lo / 1.3, hi * 1.3]; if (hi - lo < 1e-12) { hi += 1; lo -= 1; } const pad = (hi - lo) * 0.07; return [o.zero && lo >= 0 && i === 1 ? 0 : lo - pad, hi + pad];
      };
      const xr = rng(0, d.xr || o.xr, o.xlog), yr = rng(1, d.yr || o.yr, o.ylog);
      const ticks = (r, lg, n) => {
        const out = [];
        if (lg) { const dec = Math.log10(r[1] / r[0]); for (let e = Math.floor(Math.log10(r[0])); e <= Math.ceil(Math.log10(r[1])); e++) [1, 2, 5].forEach(m => { const v = m * Math.pow(10, e); if (v >= r[0] * 0.999 && v <= r[1] * 1.001 && (m === 1 || dec < 2.6) && (dec < 9 || e % 2 === 0)) out.push(v); }); }
        else { const st = nice((r[1] - r[0]) / n); for (let v = Math.ceil(r[0] / st - 1e-9) * st; v <= r[1] + st * 1e-6; v += st) out.push(Math.abs(v) < st * 1e-6 ? 0 : v); }
        return out;
      };
      // Left margin grows with the widest tick label, so labels are never clipped.
      c.font = '11px ' + mono; const ty = ticks(yr, o.ylog, Math.max(2, Math.floor((h - T - B) / 44))), L = Math.min(w * 0.3, Math.max(30, Math.max(0, ...ty.map(v => c.measureText(U.fmt(v, 3)).width)) + 12));
      const tx = ticks(xr, o.xlog, Math.max(2, Math.floor((w - L - Rr) / 76)));
      const f = (v, r, lg) => lg ? (Math.log(v) - Math.log(r[0])) / (Math.log(r[1]) - Math.log(r[0])) : (v - r[0]) / (r[1] - r[0]);
      const X = v => L + f(v, xr, o.xlog) * (w - L - Rr), Y = v => h - B - f(v, yr, o.ylog) * (h - T - B);
      this.inv = (px, py) => { const u = (px - L) / (w - L - Rr), t = (h - B - py) / (h - T - B); return [o.xlog ? Math.exp(Math.log(xr[0]) + u * Math.log(xr[1] / xr[0])) : xr[0] + u * (xr[1] - xr[0]), o.ylog ? Math.exp(Math.log(yr[0]) + t * Math.log(yr[1] / yr[0])) : yr[0] + t * (yr[1] - yr[0])]; };
      c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.07)'; c.fillStyle = C.mute; c.textBaseline = 'top'; let last = -1e9;
      tx.forEach(v => { const x = X(v), t = U.fmt(v, 3), tw = c.measureText(t).width; c.beginPath(); c.moveTo(x, T); c.lineTo(x, h - B); c.stroke(); const lx = Math.min(w - tw / 2 - 1, Math.max(tw / 2 + 1, x)); if (lx - tw / 2 > last + 8) { c.textAlign = 'center'; c.fillText(t, lx, h - B + 6); last = lx + tw / 2; } });
      c.textAlign = 'right'; c.textBaseline = 'middle'; last = 1e9;
      ty.forEach(v => { const y = Y(v); c.beginPath(); c.moveTo(L, y); c.lineTo(w - Rr, y); c.stroke(); if (Math.abs(y - last) > 13) { c.fillText(U.fmt(v, 3), L - 6, Math.min(h - B, Math.max(T + 5, y))); last = y; } });
      c.save(); c.beginPath(); c.rect(L, T, w - L - Rr, h - T - B); c.clip();
      if (d.raster) { const r = d.raster, oc = this._oc || (this._oc = document.createElement('canvas')); if (oc.width !== r.nx || oc.height !== r.ny) { oc.width = r.nx; oc.height = r.ny; } oc.getContext('2d').putImageData(new ImageData(r.data, r.nx, r.ny), 0, 0); c.imageSmoothingEnabled = !!r.smooth; c.globalAlpha = r.alpha == null ? 1 : r.alpha; c.drawImage(oc, X(r.xr[0]), Y(r.yr[1]), X(r.xr[1]) - X(r.xr[0]), Y(r.yr[0]) - Y(r.yr[1])); c.globalAlpha = 1; }
      (d.contours || []).forEach(q => { const nx = q.nx, ny = q.ny; q.levels.forEach((lv, li) => { c.beginPath(); for (let jj = 0; jj < ny - 1; jj++) for (let ii = 0; ii < nx - 1; ii++) { const v = [q.v[jj * nx + ii], q.v[jj * nx + ii + 1], q.v[(jj + 1) * nx + ii + 1], q.v[(jj + 1) * nx + ii]], P = [[q.xs[ii], q.ys[jj]], [q.xs[ii + 1], q.ys[jj]], [q.xs[ii + 1], q.ys[jj + 1]], [q.xs[ii], q.ys[jj + 1]]], pts = []; for (let e = 0; e < 4; e++) { const a = v[e], b2 = v[(e + 1) % 4]; if ((a < lv) !== (b2 < lv)) { const t = (lv - a) / (b2 - a), A = P[e], B2 = P[(e + 1) % 4]; pts.push([A[0] + (B2[0] - A[0]) * t, A[1] + (B2[1] - A[1]) * t]); } } for (let k = 0; k + 1 < pts.length; k += 2) { c.moveTo(X(pts[k][0]), Y(pts[k][1])); c.lineTo(X(pts[k + 1][0]), Y(pts[k + 1][1])); } } c.strokeStyle = (q.colors && q.colors[li]) || q.color || 'rgba(255,255,255,.35)'; c.lineWidth = (q.widths && q.widths[li]) || q.width || 1; c.setLineDash((q.dashes && q.dashes[li]) || []); c.stroke(); c.setLineDash([]); }); });
      d.series.forEach(s => {
        if (s.segs) { c.beginPath(); s.segs.forEach(q => { c.moveTo(X(q[0]), Y(q[1])); c.lineTo(X(q[2]), Y(q[3])); }); c.strokeStyle = s.color || C.mute; c.lineWidth = s.width || 1; c.globalAlpha = s.alpha == null ? 1 : s.alpha; c.stroke(); c.globalAlpha = 1; return; }
        if (s.dots) { c.globalAlpha = s.alpha == null ? 1 : s.alpha; const r = s.r || 2.2; s.pts.forEach((q, i) => { const x = X(q[0]), y = Y(q[1]), sh = s.shapes ? s.shapes[i] : 0; c.fillStyle = (s.colors && s.colors[i]) || s.color || C.ink; c.beginPath(); if (sh === 1) c.rect(x - r, y - r, 2 * r, 2 * r); else if (sh === 2) { c.moveTo(x, y - r * 1.3); c.lineTo(x + r * 1.2, y + r); c.lineTo(x - r * 1.2, y + r); c.closePath(); } else c.arc(x, y, r, 0, 7); c.fill(); if (s.rings && s.rings[i]) { c.strokeStyle = s.rings[i]; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, r + 2.5, 0, 7); c.stroke(); } }); c.globalAlpha = 1; return; }
        if (!s.pts || s.pts.length < 1) return; c.beginPath(); let pen = false;
        s.pts.forEach(p => { if (!isFinite(p[0]) || !isFinite(p[1]) || (o.xlog && p[0] <= 0) || (o.ylog && p[1] <= 0)) { pen = false; return; } const x = X(p[0]), y = Y(p[1]); pen ? c.lineTo(x, y) : c.moveTo(x, y); pen = true; });
        c.strokeStyle = s.color || C.ink; c.lineWidth = s.width || 1.6; c.setLineDash(s.dash || []); c.globalAlpha = s.alpha == null ? 1 : s.alpha;
        if (s.bars) { c.fillStyle = s.color || C.cold; s.pts.forEach(p => { const x0 = X(p[0] - s.bars / 2), x1 = X(p[0] + s.bars / 2); c.fillRect(x0 + .5, Y(p[1]), Math.max(1, x1 - x0 - 1), Y(yr[0]) - Y(p[1])); }); }
        else { if (s.fill) { c.lineTo(X(s.pts[s.pts.length - 1][0]), Y(yr[0])); c.lineTo(X(s.pts[0][0]), Y(yr[0])); c.closePath(); c.fillStyle = s.fill; c.fill(); } c.stroke(); }
        c.setLineDash([]); c.globalAlpha = 1;
      });
      c.restore();
      const boxes = [];
      d.points.forEach(p => {
        const x = X(p.x), y = Y(p.y); if (!isFinite(x) || !isFinite(y) || x < L - 1 || x > w - Rr + 1 || y < T - 1 || y > h - B + 1) return; c.beginPath(); c.arc(x, y, p.r || 4, 0, 7); c.fillStyle = p.color || C.warm; c.fill();
        if (p.ring) { c.beginPath(); c.arc(x, y, 9, 0, 7); c.strokeStyle = p.color || C.warm; c.lineWidth = 1; c.stroke(); }
        if (p.label) { // keep the label inside the canvas and away from labels already placed
          c.font = '600 12px ' + mono; const tw = c.measureText(p.label).width; let lx = x + 9, ly = y - 9; if (p.left || lx + tw > w - 2) lx = x - 9 - tw; if (lx < L + 2) lx = Math.min(w - tw - 2, L + 2); if (ly < T + 8) ly = y + 16;
          for (let k = 0; k < 4 && boxes.some(b => Math.abs(b[1] - ly) < 13 && lx < b[0] + b[2] && b[0] < lx + tw); k++) ly += 14; ly = Math.min(h - B - 3, ly); boxes.push([lx, ly, tw]);
          c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.lineWidth = 3; c.strokeStyle = 'rgba(5,8,13,.85)'; c.strokeText(p.label, lx, ly); c.fillStyle = C.ink; c.fillText(p.label, lx, ly);
        }
      });
      if (this.hover && this.hover[0] > L && this.hover[0] < w - Rr && this.hover[1] > T && this.hover[1] < h - B) {
        const [hx, hy] = this.hover, v = this.inv(hx, hy); c.strokeStyle = 'rgba(255,255,255,.25)'; c.setLineDash([3, 3]); c.lineWidth = 1;
        c.beginPath(); c.moveTo(hx, T); c.lineTo(hx, h - B); c.moveTo(L, hy); c.lineTo(w - Rr, hy); c.stroke(); c.setLineDash([]);
        this.info.textContent = 'x ' + U.fmt(v[0], 4) + ' · y ' + U.fmt(v[1], 4);
      }
    }
  };

  /* ---- labs, router, search ---- */
  U.labs = []; U.pages = {};
  U.lab = c => { U.labs.push(c); U.pages[c.id] = c; };
  U.refreshChrome = function () { document.querySelectorAll('.rail a, .nav nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + U.current)); };
  function rail() { const r = el('aside', { class: 'rail', 'aria-label': 'Laboratories' }, el('h6', {}, 'Laboratories')); U.labs.forEach(c => r.append(el('a', { href: '#' + c.id }, el('span', {}, c.num), el('span', {}, c.title), el('span', {})))); return r; }
  U.route = function () {
    let id = (location.hash || '#research').slice(1); if (!U.pages[id]) id = 'research';
    cleaners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); cleaners = [];
    const app = document.getElementById('app'); app.innerHTML = ''; U.current = id; const pg = U.pages[id];
    document.title = (id === 'research' ? '' : pg.title + ' · ') + 'Thermoscope';
    try {
      if (pg.full) { pg.render(app); U.refreshChrome(); U.reveal(); window.scrollTo(0, 0); return; }
      const page = el('div', { class: 'page' }); app.append(el('div', { class: 'shell' }, rail(), page));
      const i = U.labs.indexOf(pg), prev = U.labs[i - 1], next = U.labs[i + 1];
      page.append(el('div', { class: 'crumbs', html: '<a href="#research">Thermoscope</a> / Laboratory ' + pg.num + ' · ' + pg.title }), el('header', { class: 'chead' }, el('div', { class: 'num', 'aria-hidden': 'true' }, pg.num), el('div', { class: 'meta' }, ...(pg.tags || []).map(t => el('span', { class: 'chip' }, t))), el('h1', {}, pg.title)), el('p', { class: 'lead', html: U.eq(pg.lead) }));
      pg.render(page);
      page.append(el('nav', { class: 'pn', 'aria-label': 'Laboratory navigation' }, prev ? el('a', { href: '#' + prev.id }, el('small', {}, '← ' + prev.num), el('span', {}, prev.title)) : el('span', {}), next ? el('a', { href: '#' + next.id, style: 'text-align:right' }, el('small', {}, next.num + ' →'), el('span', {}, next.title)) : el('span', {})));
    } catch (e) { console.error(e); app.append(el('div', { class: 'page' }, el('h2', {}, 'This laboratory hit an error'), el('p', { class: 'mute' }, String(e && e.message || e)))); }
    U.refreshChrome(); U.reveal(); window.scrollTo(0, 0);
  };
  U.rail = rail;
  // Sections settle into place as they enter the viewport. They are always visible; only a short slide is animated.
  U.reveal = function () { if (U.reduced() || !('IntersectionObserver' in window)) return; const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); document.querySelectorAll('#app .step').forEach(s => { s.classList.add('rv'); io.observe(s); }); U.onLeave(() => io.disconnect()); };
  // One experiment: learning flow (problem, idea, assumptions, equation) -> bench -> (try, result, thermodynamics, conclusion)
  U.exp = function (root, o) {
    const row = (k, t, dyn) => { const d = el('div', { class: 'fl' }, el('b', {}, k), el('span', { html: U.eq(t || '') })); if (dyn) o[dyn] = d.lastChild; return d; };
    const sec = el('section', { class: 'step' }, el('div', { class: 'lab' }, el('b', {}, o.n), o.kicker || 'Experiment'), el('h2', {}, o.title),
      el('div', { class: 'flow' }, row('Problem', o.problem), row('Idea', o.idea), row('Assumptions', o.assume)), o.eq ? el('div', { html: [].concat(o.eq).map(e => U.eqBlock(e[0], e[1])).join('') }) : null);
    root.append(sec); const B = U.bench({ noStage: !o.stage, assume: o.model }); sec.append(B.node);
    const res = row('Result', '', 'resultEl'); sec.append(el('div', { class: 'flow after' }, row('Try this', o.try), res, row('Thermodynamics', o.thermo), row('Conclude', o.conclude)));
    o.build(B, t => { res.lastChild.innerHTML = U.eq(t); }); return sec;
  };
  // Matrix heatmap with hover read-out. set(M (p x p or rows x cols), {rows, cols, names, max, seq})
  U.Heat = class {
    constructor(parent, o) { this.o = Object.assign({ h: 300, title: '' }, o); this.cv = el('canvas', { role: 'img', 'aria-label': this.o.title, style: 'width:100%;display:block;height:' + this.o.h + 'px' }); this.info = el('span', {}, ''); this.ttl = el('span', {}, this.o.title); parent.append(el('div', { class: 'plot' }, el('div', { class: 'ttl' }, this.ttl), el('div', { class: 'axl' }, el('span', {}, 'hover a cell to read its value'), this.info), this.cv));
      const ro = new ResizeObserver(() => this.draw()); ro.observe(this.cv); U.onLeave(() => ro.disconnect());
      this.cv.addEventListener('pointermove', e => { if (!this.d) return; const r = this.cv.getBoundingClientRect(), s = this.side, j = Math.floor((e.clientX - r.left - this.x0) / s), i = Math.floor((e.clientY - r.top) / s), d = this.d; if (i >= 0 && j >= 0 && i < d.rows && j < d.cols) this.info.textContent = (d.names ? d.names[i] + ' × ' + d.names[j] + ' = ' : '[' + i + ',' + j + '] = ') + U.fmt(d.M[i * d.cols + j], 4); });
      this.cv.addEventListener('pointerleave', () => { this.info.textContent = ''; }); }
    set(M, d) { this.d = Object.assign({ M }, d); this.draw(); }
    draw() { const d = this.d, cv = this.cv, w = cv.clientWidth, h = cv.clientHeight; if (!d || !w) return; const dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = this.side = Math.min(w / d.cols, h / d.rows); this.x0 = (w - s * d.cols) / 2; let mx = d.max; if (!mx) { mx = 0; for (let i = 0; i < d.M.length; i++) mx = Math.max(mx, Math.abs(d.M[i])); }
      for (let i = 0; i < d.rows; i++) for (let j = 0; j < d.cols; j++) { const v = d.M[i * d.cols + j] / (mx || 1), a = Math.min(1, Math.abs(v)); c.fillStyle = d.seq ? 'rgba(255,178,74,' + a + ')' : v >= 0 ? 'rgba(255,107,58,' + a + ')' : 'rgba(92,198,255,' + a + ')'; c.fillRect(this.x0 + j * s, i * s, s + .5, s + .5); }
      c.strokeStyle = 'rgba(255,255,255,.2)'; c.strokeRect(this.x0 + .5, .5, s * d.cols - 1, s * d.rows - 1); }
  };
  U.boot = function () {
    const ovl = document.getElementById('search'), inp = ovl.querySelector('input'), out = ovl.querySelector('.out');
    const run = () => { const q = inp.value.trim().toLowerCase(); out.innerHTML = ''; const hits = U.labs.filter(x => !q || (x.title + ' ' + x.lead + ' ' + (x.keys || '')).toLowerCase().includes(q)); hits.forEach(x => out.append(el('a', { class: 'res', href: '#' + x.id, onclick: close, html: '<span class="tag">' + x.num + '</span><b>' + x.title + '</b><small>' + (x.blurb || '') + '</small>' }))); if (!hits.length) out.append(el('p', { class: 'mute', style: 'padding:14px' }, 'No section matches. Try ridge, kernel, ROC, dataset or limitations.')); };
    const open = () => { ovl.classList.add('open'); inp.value = ''; run(); inp.focus(); }, close = () => ovl.classList.remove('open');
    document.querySelectorAll('[data-open-search]').forEach(b => b.addEventListener('click', open)); inp.addEventListener('input', run);
    ovl.addEventListener('click', e => { if (e.target === ovl) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); open(); } });
    const lb = document.getElementById('lite'); if (lb) { const show = () => { lb.textContent = '3D: ' + (K3.lite ? 'Lite' : 'High'); lb.setAttribute('aria-pressed', K3.lite); }; show(); lb.addEventListener('click', () => { K3.lite = !K3.lite; U.store.set('lite', K3.lite); show(); U.route(); }); }
    const sp = document.getElementById('sp'); if (sp) addEventListener('scroll', () => { const m = document.documentElement.scrollHeight - innerHeight; sp.style.transform = 'scaleX(' + (m > 0 ? Math.min(1, scrollY / m) : 0) + ')'; }, { passive: true });
    addEventListener('hashchange', U.route); U.route();
  };
})();
