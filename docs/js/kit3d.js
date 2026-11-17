/* Heatwork 3D kit: lazy stages, orbit, lighting, reusable piston-cylinder rig and molecular box. Needs THREE r128. */
(function () {
  'use strict';
  const K3 = window.K3 = {}, el = U.el;
  K3.lite = !!U.store.get('lite', false); // lighter rendering: device-pixel ratio capped at 1, fewer particles
  K3.ok = function () {
    if (K3._ok !== undefined) return K3._ok;
    try { const c = document.createElement('canvas'); K3._ok = !!window.THREE && !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { K3._ok = false; }
    return K3._ok;
  };
  function fallback(container) {
    container.append(el('div', { class: 'fallback' }, el('div', { html: '<b style="color:var(--ink)">3D view unavailable on this device.</b><br>WebGL could not start, so the apparatus is not drawn. Every control, number and graph on this page still runs the same calculation.' })));
    return null;
  }
  function envTexture(renderer) {
    const T = THREE, s = new T.Scene(); s.background = new T.Color(0x04060a);
    const add = (col, k, x, y, z, sx, sy, sz) => { const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); s.add(m); };
    add(0xffffff, 7, 0, 9, 0, 7, .2, 7); add(0x5cc6ff, 6, -9, 2, 2, .2, 6, 6); add(0xff8a4a, 6, 9, 1.5, -2, .2, 4, 5); add(0xffffff, 2.5, 0, 2, -9, 9, 3, .2); add(0xffffff, 1.5, 0, 3, 9, 6, 2, .2);
    const pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(s, 0.03).texture; pm.dispose();
    s.traverse(o => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
    return tex;
  }
  K3.stage = function (container, o) {
    o = Object.assign({ cam: [5.2, 3.2, 6.2], target: [0, 1.5, 0], orbit: true, fov: 36, rmin: 3, rmax: 20, hint: 'Drag or use arrow keys to rotate', parallax: true }, o);
    if (!K3.ok()) return (o.fallback || fallback)(container);
    const T = THREE, canvas = o.canvas || el('canvas', { 'aria-label': o.label || 'Interactive 3D apparatus', role: 'img' });
    if (!o.canvas) container.append(canvas);
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { if (!o.canvas) canvas.remove(); return (o.fallback || fallback)(container); }
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(o.fov, 1, 0.1, 100);
    try { scene.environment = envTexture(renderer); } catch (e) { console.warn('env map skipped', e); }
    scene.add(new T.HemisphereLight(0x9fc4ff, 0x0a0c10, 0.55));
    const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(4, 8, 5); scene.add(key);
    const rimA = new T.PointLight(0x2f7bff, 1.6, 14, 2); rimA.position.set(-4, 2.5, -3); scene.add(rimA); const rimB = new T.PointLight(0x7ee0ff, 1.1, 12, 2); rimB.position.set(4, 1.2, 3.5); scene.add(rimB);
    const target = new T.Vector3(...o.target), off = new T.Vector3(...o.cam).sub(target);
    let rad = off.length(), theta = Math.atan2(off.x, off.z), phi = Math.acos(off.y / rad), dpr = Math.min(window.devicePixelRatio || 1, K3.lite ? 1 : 2), W = 1, H = 1, manual = false, ox = 0, oy = 0, sw = 0, tx = 0, ty = 0;
    const place = () => { if (manual) return; const th = theta + ox + sw, ph = Math.min(1.52, Math.max(0.12, phi + oy)); camera.position.set(target.x + rad * Math.sin(ph) * Math.sin(th), target.y + rad * Math.cos(ph), target.z + rad * Math.sin(ph) * Math.cos(th)); camera.lookAt(target); };
    container.addEventListener('pointermove', e => { const r = container.getBoundingClientRect(); tx = (e.clientX - r.left) / (r.width || 1) - 0.5; ty = (e.clientY - r.top) / (r.height || 1) - 0.5; });
    container.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
    const resize = () => {
      W = container.clientWidth || 1; H = container.clientHeight || 1; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); camera.aspect = W / H;
      const f = o.offset ? o.offset(W, H) : 0; if (f) camera.setViewOffset(W, H, -f * W, 0, W, H); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(container); resize(); place();
    let drag = null, idle = 0;
    if (o.orbit) {
      canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; try { canvas.setPointerCapture(e.pointerId); } catch (x) { } });
      canvas.addEventListener('pointermove', e => { if (!drag) return; theta -= (e.clientX - drag[0]) * 0.007; phi = Math.min(1.52, Math.max(0.12, phi - (e.clientY - drag[1]) * 0.006)); drag = [e.clientX, e.clientY]; idle = 0; place(); });
      const up = () => { drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      const zoom = k => { rad = Math.min(o.rmax, Math.max(o.rmin, rad * k)); place(); };
      canvas.tabIndex = 0; canvas.addEventListener('keydown', e => { const m = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key]; if (m) { theta += m[0]; phi = Math.min(1.52, Math.max(0.12, phi + m[1])); idle = 0; place(); e.preventDefault(); } else if (e.key === '+' || e.key === '=') zoom(0.85); else if (e.key === '-') zoom(1.18); });
      container.append(el('div', { class: 'hint' }, o.hint), el('div', { class: 'zoom' }, el('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => zoom(0.85) }, '+'), el('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => zoom(1.18) }, '−')));
    }
    const fns = [], anns = [], v3 = new T.Vector3();
    let raf, last = performance.now(), visible = true, dead = false, acc = 0, nf = 0;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(container);
    const frame = t => {
      if (dead) return; raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (t - last) / 1000); last = t; if (!visible || document.hidden) return;
      if (o.orbit && o.autoRotate && !drag && !U.reduced()) { idle += dt; if (idle > 2.5) theta += dt * 0.05; }
      if (!manual) { const kk = Math.min(1, dt * 4), red = U.reduced() || !o.parallax || drag; ox += ((red ? 0 : tx * 0.24) - ox) * kk; oy += ((red ? 0 : ty * 0.1) - oy) * kk; sw *= Math.max(0, 1 - dt * 2.6); place(); }
      fns.forEach(f => f(dt, t / 1000)); renderer.render(scene, camera);
      anns.forEach(a => { v3.copy(typeof a.p === 'function' ? a.p() : a.p).project(camera); const vis = v3.z < 1 && a.show !== false; a.el.style.display = vis ? '' : 'none'; if (vis) { a.el.style.left = ((v3.x * .5 + .5) * W).toFixed(1) + 'px'; a.el.style.top = ((-v3.y * .5 + .5) * H).toFixed(1) + 'px'; } });
      acc += dt; if (++nf === 50) { if (acc / nf > 0.032 && dpr > 0.8) { dpr = Math.max(0.75, dpr - 0.25); resize(); } acc = 0; nf = 0; } // adaptive quality
    };
    raf = requestAnimationFrame(frame);
    const S = {
      scene, camera, renderer, target, T, pointer: () => [tx, ty], swing: a => { if (!U.reduced()) sw = a == null ? 0.32 : a; },
      onFrame: f => fns.push(f),
      pick(points, e, visible) { // nearest particle under the pointer, or -1
        const r = canvas.getBoundingClientRect(), rc = new T.Raycaster(); rc.params.Points.threshold = 0.07; rc.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hits = rc.intersectObject(points).filter(h => !visible || visible(h.index)).sort((a, b) => a.distanceToRay - b.distanceToRay); return hits.length ? hits[0].index : -1; },
      annotate(p, text) { const a = { p, el: el('div', { class: 'ann' }, text) }; container.append(a.el); anns.push(a); return a; },
      setCam(pos, tgt) { manual = true; camera.position.set(pos[0], pos[1], pos[2]); camera.lookAt(tgt[0], tgt[1], tgt[2]); },
      floor() {
        const f = new T.Mesh(new T.CircleGeometry(16, 72), new T.MeshStandardMaterial({ color: 0x060b14, roughness: 0.36, metalness: 0.8 })); f.rotation.x = -Math.PI / 2; scene.add(f);
        const g = new T.GridHelper(32, 64, 0x1c3a66, 0x0d1a2e); g.position.y = 0.003; g.material.transparent = true; g.material.opacity = 0.6; scene.add(g); scene.fog = new T.FogExp2(0x04070d, 0.05);
      },
      dispose() {
        if (dead) return; dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
        scene.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) [].concat(x.material).forEach(m => m.dispose()); });
        if (scene.environment) scene.environment.dispose(); renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { } if (!o.canvas) canvas.remove();
      }
    };
    U.onLeave(S.dispose); return S;
  };

  const STOPS = [[0, 0x4fb8ff], [0.3, 0xd9ecff], [0.55, 0xffd27a], [0.8, 0xff7a3a], [1, 0xff3d2e]];
  K3.tempColor = function (T, out, lo, hi) { // 200 K blue -> 1500 K red by default
    const t = Math.min(1, Math.max(0, (T - (lo || 200)) / ((hi || 1500) - (lo || 200)))); let i = 0; while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
    const a = STOPS[i], b = STOPS[i + 1]; K3._c1 = K3._c1 || new THREE.Color(); out.setHex(a[1]); K3._c1.setHex(b[1]); return out.lerp(K3._c1, (t - a[0]) / (b[0] - a[0]));
  };

  // Transparent piston-cylinder with gas molecules. set({h: 0..1 fill height, T: K, heat: -1..1})
  K3.pistonRig = function (stage, o) {
    o = Object.assign({ N: 260, R: 1, H: 3 }, o);
    const T = THREE, g = new T.Group(), R = o.R, H = o.H, Y0 = 0.4; stage.scene.add(g);
    const metal = new T.MeshStandardMaterial({ color: 0xc3ccd6, metalness: 1, roughness: 0.24 }), dark = new T.MeshStandardMaterial({ color: 0x161c25, metalness: 0.9, roughness: 0.38 });
    const cyl = (rt, rb, h, mat, y, seg) => { const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 64), mat); m.position.y = y; g.add(m); return m; };
    const ring = (r, tube, mat, y, par) => { const m = new T.Mesh(new T.TorusGeometry(r, tube, 14, 72), mat); m.rotation.x = Math.PI / 2; m.position.y = y; (par || g).add(m); return m; };
    cyl(R + 0.42, R + 0.6, 0.3, dark, 0.15);
    const heater = cyl(R + 0.03, R + 0.03, 0.1, new T.MeshStandardMaterial({ color: 0x20252d, metalness: 0.5, roughness: 0.5, emissive: 0xff5a1e, emissiveIntensity: 0 }), 0.35);
    const glass = new T.Mesh(new T.CylinderGeometry(R, R, H + 0.5, 72, 1, true), new T.MeshPhysicalMaterial({ color: 0xbfe3ff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false, clearcoat: 1, envMapIntensity: 1.6 }));
    glass.position.y = Y0 + (H + 0.5) / 2; glass.renderOrder = 3; g.add(glass);
    ring(R, 0.05, metal, Y0); ring(R, 0.05, metal, Y0 + H + 0.5);
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, p = cyl(0.045, 0.045, H + 1.0, metal, Y0 + (H + 1.0) / 2 - 0.1, 12); p.position.x = Math.cos(a) * (R + 0.3); p.position.z = Math.sin(a) * (R + 0.3); }
    ring(R + 0.3, 0.05, dark, Y0 + H + 0.85);
    const pist = new T.Group(); g.add(pist);
    const head = new T.Mesh(new T.CylinderGeometry(R - 0.025, R - 0.025, 0.24, 64), metal); pist.add(head);
    ring(R - 0.02, 0.028, dark, 0.05, pist); ring(R - 0.02, 0.028, dark, -0.05, pist);
    const rod = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, H * 0.9, 24), metal); rod.position.y = H * 0.45 + 0.1; pist.add(rod);
    const cap = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.12, 48), dark); cap.position.y = H * 0.9 + 0.12; pist.add(cap);
    const N = o.N, dots = new T.InstancedMesh(new T.SphereGeometry(0.036, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N); dots.frustumCulled = false; g.add(dots);
    const lamp = new T.PointLight(0xffffff, 1.4, 7, 2); g.add(lamp);
    const P = new Float32Array(N * 3), V = new Float32Array(N * 3), M = new T.Matrix4(), col = new T.Color(), Rg = R - 0.07;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * Rg; P[i * 3] = Math.cos(a) * r; P[i * 3 + 1] = Math.random(); P[i * 3 + 2] = Math.sin(a) * r;
      const u = Math.random() * 2 - 1, b = Math.random() * 6.283, q = Math.sqrt(1 - u * u), sp = 0.6 + Math.random() * 0.8; V[i * 3] = q * Math.cos(b) * sp; V[i * 3 + 1] = u * sp; V[i * 3 + 2] = q * Math.sin(b) * sp;
      dots.setColorAt(i, col.setHex(0xffffff));
    }
    const st = { h: 0.5, T: 300, heat: 0 }; let flash = 0, first = true;
    const rig = {
      group: g, H, Y0, R,
      set(s) { Object.assign(st, s); },
      top() { return Y0 + Math.max(0.04, st.h) * H; },
      flash() { flash = 1; },
      update(dt) {
        const top = rig.top(), lo = Y0 + 0.06, hi = Math.max(lo + 0.02, top - 0.06), sp = 1.5 * Math.sqrt(Math.max(20, st.T) / 300);
        pist.position.y = top + 0.12;
        for (let i = 0; i < N; i++) {
          const j = i * 3; if (first) P[j + 1] = lo + P[j + 1] * (hi - lo);
          P[j] += V[j] * sp * dt; P[j + 1] += V[j + 1] * sp * dt; P[j + 2] += V[j + 2] * sp * dt;
          const rr = Math.hypot(P[j], P[j + 2]);
          if (rr > Rg) { const nx = P[j] / rr, nz = P[j + 2] / rr, vn = V[j] * nx + V[j + 2] * nz; if (vn > 0) { V[j] -= 2 * vn * nx; V[j + 2] -= 2 * vn * nz; } P[j] = nx * Rg; P[j + 2] = nz * Rg; }
          if (P[j + 1] < lo) { P[j + 1] = lo; V[j + 1] = Math.abs(V[j + 1]); } else if (P[j + 1] > hi) { P[j + 1] = hi; V[j + 1] = -Math.abs(V[j + 1]); }
          M.makeTranslation(P[j], P[j + 1], P[j + 2]); dots.setMatrixAt(i, M);
        }
        first = false; dots.instanceMatrix.needsUpdate = true;
        K3.tempColor(st.T, col); dots.material.color.copy(col); lamp.color.copy(col); lamp.position.y = (lo + hi) / 2;
        flash = Math.max(0, flash - dt * 3); lamp.intensity = 1.2 + Math.min(2.2, st.T / 600) + flash * 9;
        const k = Math.max(-1, Math.min(1, st.heat)); heater.material.emissive.setHex(k >= 0 ? 0xff5a1e : 0x2f9dff); heater.material.emissiveIntensity = Math.abs(k) * 2.6;
      }
    };
    rig.update(0); return rig;
  };

  // Molecular box driven by a TH.GasBox simulation
  K3.gasBox = function (stage, sim, o) {
    const T = THREE, s = o.scale, g = new T.Group(); stage.scene.add(g);
    const frame = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: 0x8fb4d6, transparent: true, opacity: 0.7 }));
    const walls = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.06, roughness: 0.05, side: T.DoubleSide, depthWrite: false }));
    const part = new T.Mesh(new T.BoxGeometry(0.02, 1, 1), new T.MeshStandardMaterial({ color: 0xc3ccd6, metalness: 1, roughness: 0.3, transparent: true, opacity: 0.55 }));
    g.add(frame, walls, part);
    const dots = new T.InstancedMesh(new T.SphereGeometry(sim.r * s, 12, 10), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 }), sim.max); dots.frustumCulled = false; g.add(dots);
    const M = new T.Matrix4(), c = new T.Color();
    for (let i = 0; i < sim.max; i++) dots.setColorAt(i, c.setHex(0xffffff));
    return {
      group: g,
      dispose() { stage.scene.remove(g); g.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); },
      update() {
        const L = sim.L, x = sim.x, v = sim.v; frame.scale.set(L[0] * s, L[1] * s, L[2] * s); walls.scale.copy(frame.scale); part.scale.set(1, L[1] * s, L[2] * s); part.visible = sim.partition;
        g.position.y = o.y != null ? o.y : L[1] * s / 2 + 0.05; dots.count = sim.N;
        const vr = sim.sigma(o.Tref ? o.Tref() : 300) * 1.732 || 1;
        for (let i = 0; i < sim.N; i++) {
          const j = i * 3; M.makeTranslation((x[j] - L[0] / 2) * s, (x[j + 1] - L[1] / 2) * s, (x[j + 2] - L[2] / 2) * s); dots.setMatrixAt(i, M);
          const sp = Math.hypot(v[j], v[j + 1], v[j + 2]) / vr; dots.setColorAt(i, K3.tempColor(sp, c, 0.2, 2.2));
        }
        dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      }
    };
  };
})();
