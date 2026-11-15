// CAD-style 3D viewer: model locked at centre, orbit (left drag), pan (right drag / shift-drag),
// zoom (wheel / pinch). Static anatomy — no pose, no heartbeat. Out-of-range regions glow in their
// status colour; clicking an organ or hotspot isolates that region's organs and nerves.
import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { createHotspotLayer } from './hotspots.mjs';
import { loadAnatomy, instantiate, placeholderBody, paint, settle, meshesOf, addLights } from './anatomy.mjs';
import { ORGANS, STRUCTURE_OWNER, anchorsFromStructures } from '../organs.mjs';

// View directions (from the target); distance is fitted to the stage so the whole body shows.
const VIEWS = {
  front: [0, 0.04, 1], back: [0, 0.04, -1], left: [1, 0.04, 0], right: [-1, 0.04, 0], iso: [0.62, 0.38, 0.72],
};
const HOME = new THREE.Vector3(0, 0.92, 0);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class BodyViewer {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.selected = null;
    this.statuses = {};
    this.tween = null;
    this.source = 'loading';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'viewer__canvas';
    container.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.02, 50);
    addLights(this.scene);
    this.scene.add(this.buildPlatform());

    this.meshes = [];
    this.pickable = [];
    this.anchors = Object.fromEntries(ORGANS.map((o) => [o.id, new THREE.Vector3(...o.anchor)]));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(HOME);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 6;
    this.controls.screenSpacePanning = true;
    this.controls.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };
    this.controls.listenToKeyEvents(container);
    this.controls.update();

    this.hotspots = createHotspotLayer(container, (id) => this.onSelect(id));
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindPointer();

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(container);
    this.camera.position.copy(this.viewPosition('front'));
    this.controls.target.copy(HOME);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());

    container.classList.add('is-loading');
    this.ready = loadAnatomy()
      .then(({ scene, structures }) => {
        this.setBody(instantiate(scene));
        const anchors = anchorsFromStructures(structures);
        for (const [id, p] of Object.entries(anchors)) this.anchors[id].set(...p);
        this.source = 'anatomy';
      })
      .catch((error) => {
        console.warn('Anatomy model unavailable, using placeholder body:', error);
        this.setBody(placeholderBody());
        this.source = 'placeholder';
      })
      .finally(() => container.classList.remove('is-loading'));
  }

  setBody(root) {
    if (this.body) this.scene.remove(this.body);
    this.body = root;
    this.scene.add(root);
    this.meshes = meshesOf(root);
    this.pickable = this.meshes.filter((m) => m.userData.structure !== 'skin');
    this.applyPaint();
    settle(this.meshes);
  }

  buildPlatform() {
    const group = new THREE.Group();
    const ring = (r, opacity) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.005, 96),
        new THREE.MeshBasicMaterial({ color: 0x8f8a85, transparent: true, opacity, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      return m;
    };
    group.add(ring(0.42, 0.3), ring(0.62, 0.16), ring(0.9, 0.07));
    const grid = new THREE.PolarGridHelper(0.9, 12, 3, 64, 0x363333, 0x1d1b1b);
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    group.add(grid);
    group.position.y = 0.001;
    return group;
  }

  bindPointer() {
    const canvas = this.renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return;
      const id = this.pick(e);
      if (id) this.onSelect(id);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      canvas.style.cursor = this.pick(e) ? 'pointer' : 'grab';
    });
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickable, false).find((h) => h.object.userData.opacity > 0.15);
    return hit ? STRUCTURE_OWNER[hit.object.userData.structure] : null;
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    const first = !this.sized;
    this.sized = true;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (first) { this.camera.position.copy(this.viewPosition('front')); this.controls.target.copy(HOME); }
  }

  /** Camera distance that fits the 1.78 m body (plus margin) in both height and width. */
  fitDistance() {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(1.02 / t, 0.5 / (t * this.camera.aspect));
  }

  viewPosition(name) {
    return new THREE.Vector3(...VIEWS[name]).normalize().multiplyScalar(this.fitDistance()).add(HOME);
  }

  setStatuses(statuses) {
    const key = JSON.stringify(statuses);
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statuses = statuses;
    this.hotspots.setStatuses(statuses, this.selected);
    this.applyPaint();
  }

  select(id) {
    if (id === this.selected) return;
    this.selected = id;
    this.hotspots.setStatuses(this.statuses, id);
    this.applyPaint();
    // Narrow (portrait) viewports need the camera further back to keep context in frame.
    if (id) this.focus(this.anchors[id], 1.5 / Math.min(1, this.camera.aspect / 1.1));
  }

  applyPaint() {
    paint(this.meshes, this.statuses, this.selected);
    if (reducedMotion()) settle(this.meshes);
  }

  focus(point, distance) {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.animateTo(point.clone().add(direction.multiplyScalar(distance)), point.clone());
  }

  setView(name) {
    if (name === 'reset') { this.onSelect(null); name = 'front'; }
    this.animateTo(this.viewPosition(name), HOME.clone());
  }

  animateTo(position, target) {
    if (reducedMotion()) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      return;
    }
    this.tween = {
      start: performance.now(), duration: 650,
      fromPos: this.camera.position.clone(), toPos: position,
      fromTarget: this.controls.target.clone(), toTarget: target,
    };
  }

  frame() {
    // The viewer element is re-parented into the astronaut page; skip work while it is detached.
    if (document.hidden || !this.container.isConnected || !this.container.clientWidth) return;
    if (this.tween) {
      const t = Math.min(1, (performance.now() - this.tween.start) / this.tween.duration);
      const k = ease(t);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, k);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k);
      if (t === 1) this.tween = null;
    }
    this.controls.update();

    for (const m of this.meshes) {
      const d = m.userData;
      if (Math.abs(d.opacity - d.target) > 0.002) {
        d.opacity += (d.target - d.opacity) * 0.15;
        if (m.material.uniforms) m.material.uniforms.uOpacity.value = d.opacity;
        else m.material.opacity = Math.min(1, d.opacity);
        m.visible = d.opacity > 0.01;
      }
    }

    const { clientWidth: w, clientHeight: h } = this.container;
    const centerDist = this.camera.position.distanceTo(this.controls.target);
    const v = new THREE.Vector3();
    for (const organ of ORGANS) {
      const anchor = this.anchors[organ.id];
      v.copy(anchor).project(this.camera);
      const behind = this.camera.position.distanceTo(anchor) > centerDist + 0.08 && this.selected !== organ.id;
      this.hotspots.place(organ.id, (v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h, behind || v.z > 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch { return false; }
}
