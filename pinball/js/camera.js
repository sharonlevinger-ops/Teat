// Four camera modes with auto-fit to any portrait aspect ratio and smooth transitions.
import * as THREE from 'three';
import { V, TILT } from './world.js';
import * as L from './layout.js';

export const MODES = [
  { id: 'top', name: 'מבט עילי', elev: 86, fov: 34, target: [384, 688], margin: { top: 0.86, bottom: -0.99, side: 1.0 } },
  { id: 'cabinet', name: 'מכונה אמיתית', elev: 48, fov: 50, target: [384, 640], margin: { top: 0.82, bottom: -0.97, side: 1.0 } },
  { id: 'balanced', name: 'מאוזן', elev: 64, fov: 44, target: [384, 660], margin: { top: 0.84, bottom: -0.97, side: 1.0 } },
  { id: 'follow', name: 'דינמי עוקב', elev: 54, fov: 48, target: [384, 700], margin: { top: 0.82, bottom: -0.97, side: 1.0 }, zoom: 0.62 },
];

export class CameraRig {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(50, aspect, 0.05, 200);
    this.mode = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.goalPos = new THREE.Vector3(); this.goalLook = new THREE.Vector3();
    this.follow = new THREE.Vector3();
    this.blend = 1;
    this.shake = 0;
    this.tiltM = new THREE.Matrix4().makeRotationX(TILT);
    this.corners = [
      [0, 0, 0], [L.IMG.w, 0, 0], [0, L.IMG.h, 0], [L.IMG.w, L.IMG.h, 0], [0, 0, 60], [L.IMG.w, 0, 60],
    ].map(([x, y, h]) => V(x, y, h).applyMatrix4(this.tiltM));
    this.setAspect(aspect);
    this.snap();
  }

  setAspect(a) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); this.fits = MODES.map((m) => this.fit(m)); }

  dirFor(m) { const e = THREE.MathUtils.degToRad(m.elev); return new THREE.Vector3(0, Math.sin(e), Math.cos(e)); }

  // binary-search the distance so the whole table fits inside the safe area of the screen
  fit(m) {
    const cam = this.cam.clone(); cam.fov = m.fov; cam.aspect = this.cam.aspect; cam.updateProjectionMatrix();
    const target = V(m.target[0], m.target[1]).applyMatrix4(this.tiltM);
    const dir = this.dirFor(m);
    let lo = 2, hi = 80;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld();
      let ok = true;
      for (const c of this.corners) {
        const p = c.clone().project(cam);
        if (p.z > 1 || Math.abs(p.x) > m.margin.side || p.y > m.margin.top || p.y < m.margin.bottom) { ok = false; break; }
      }
      if (ok) hi = d; else lo = d;
    }
    return { target, dir, dist: hi };
  }

  next() { this.mode = (this.mode + 1) % MODES.length; this.blend = 0; return MODES[this.mode]; }
  set(i) { this.mode = i; this.blend = 0; }

  snap() { this.compute(null); this.pos.copy(this.goalPos); this.look.copy(this.goalLook); }

  compute(ballPos) {
    const m = MODES[this.mode], f = this.fits[this.mode];
    if (m.id === 'follow') {
      const tgt = ballPos ? ballPos.clone() : f.target.clone();
      tgt.x = THREE.MathUtils.clamp(tgt.x * 0.55, -1.2, 1.2);
      tgt.z = THREE.MathUtils.clamp(tgt.z, -4.4, 4.2);
      this.follow.lerp(tgt, 0.06);
      this.goalLook.copy(this.follow);
      this.goalPos.copy(this.follow).addScaledVector(f.dir, f.dist * m.zoom);
    } else {
      this.goalLook.copy(f.target);
      this.goalPos.copy(f.target).addScaledVector(f.dir, f.dist);
    }
    this.cam.fov += (m.fov - this.cam.fov) * 0.1;
  }

  update(dt, ballPos) {
    this.compute(ballPos);
    this.blend = Math.min(1, this.blend + dt * 1.6);
    const k = this.blend < 1 ? 0.12 : 0.25;
    this.pos.lerp(this.goalPos, k); this.look.lerp(this.goalLook, k);
    this.cam.position.copy(this.pos);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.05; this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.05; }
    this.cam.lookAt(this.look);
    this.cam.updateProjectionMatrix();
  }
}
