// Crew-overview thumbnails: one small offscreen WebGL renderer draws each astronaut's body (with
// that astronaut's out-of-range structures lit) into an ordinary 2D <canvas>. Re-renders only when
// a crew member's region statuses change, so three thumbnails cost one WebGL context and no loop.
import * as THREE from '../../vendor/three/three.module.min.js';
import { loadAnatomy, instantiate, placeholderBody, paint, settle, meshesOf, addLights } from './anatomy.mjs';
import { ORGANS } from '../organs.mjs';

const W = 220, H = 440;

export class BodyThumbs {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    addLights(this.scene);
    this.camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 20);
    this.camera.position.set(0.55, 1.05, 4.6);
    this.camera.lookAt(0, 0.9, 0);
    this.drawn = new WeakMap(); // canvas -> status key last drawn
    this.ready = loadAnatomy()
      .then(({ scene }) => instantiate(scene))
      .catch(() => placeholderBody())
      .then((body) => {
        this.body = body;
        this.scene.add(body);
        this.meshes = meshesOf(body);
      });
  }

  /** Draw if the canvas is new or the statuses changed. */
  draw(canvas, statuses) {
    if (!this.meshes) return;
    const key = JSON.stringify(statuses);
    if (this.drawn.get(canvas) === key) return;
    this.drawn.set(canvas, key);
    paint(this.meshes, statuses, null);
    settle(this.meshes);
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    canvas.width = src.width;
    canvas.height = src.height;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, 0, 0);
  }
}

/** No-WebGL stand-in: a flat front silhouette with a dot per out-of-range region. */
export function fallbackThumb(statuses) {
  const dots = ORGANS.filter((o) => statuses[o.id] === 'alert' || statuses[o.id] === 'watch')
    .map((o) => `<circle cx="${o.anchor[0]}" cy="${-o.anchor[1]}" r=".04" class="thumb-dot thumb-dot--${statuses[o.id]}"/>`).join('');
  return `<svg class="thumb-svg" viewBox="-0.45 -1.84 0.9 1.86" aria-hidden="true">
    <g transform="scale(1,-1)" class="thumb-body"><ellipse cx="0" cy="1.635" rx=".097" ry=".118"/>
    <path d="M-.05 1.53 L-.05 1.47 -.19 1.43 -.29 1.15 -.33 .82 -.30 .80 -.25 1.12 -.17 1.30 -.17 .93 -.15 .5 -.14 .04 -.06 .02 -.07 .5 -.02 .9 .02 .9 .07 .5 .06 .02 .14 .04 .15 .5 .17 .93 .17 1.30 .25 1.12 .30 .80 .33 .82 .29 1.15 .19 1.43 .05 1.47 .05 1.53Z"/></g>
    ${dots}</svg>`;
}
