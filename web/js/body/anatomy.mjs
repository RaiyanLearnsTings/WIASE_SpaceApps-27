// Loads the Z-Anatomy-derived model (web/models/astronaut.glb, CC BY-SA 4.0) once and hands out
// independent copies (shared geometry, own materials) for the main viewer and the crew thumbnails.
// Also holds the paint rules shared by both: data-driven critical highlights and click isolation.
import * as THREE from '../../vendor/three/three.module.min.js';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/meshopt_decoder.module.js';
import { shellMaterial, buildBody } from './model.mjs';
import { ORGAN_BY_ID, criticalStructures } from '../organs.mjs';

export const STATUS_HEX = { alert: 0xef1752, watch: 0xf3e600, normal: 0x55ead4, info: 0xc9c4be, unavailable: 0x4d4946 };
export const SHELL_HEX = 0x9aa5a3;

export const ATTRIBUTION = '3D anatomy: Z-Anatomy – The libre 3D atlas of anatomy (CC BY-SA 4.0); BodyParts3D – The Database Center for Life Science (CC BY-SA 2.1 JP). Modified.';

// Resting opacity per structure: translucent lungs and skeleton so the heart, vessels and nerves read through.
const BASE_OPACITY = {
  skin: 1, lungs: 0.42, spine_bones: 0.28, marrow: 0.5, trachea: 0.75,
  vagus: 0.9, phrenic: 0.9, arm_nerve: 0.85, auditory_nerve: 0.9, spinal_cord: 0.85,
};
const BASE_EMISSIVE = 0.1;

let loading = null;

/** Promise<{ scene, structures, info }> — rejects if the model or its decoder can't load. */
export function loadAnatomy() {
  loading ??= (async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [gltf, info] = await Promise.all([
      loader.loadAsync('models/astronaut.glb'),
      fetch('models/structure_info.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const names = new Set();
    gltf.scene.traverse((o) => { if (o.isMesh) names.add(o.name); });
    if (!names.has('skin') || !names.has('heart')) throw new Error('Anatomy model is missing named structures');
    return { scene: gltf.scene, structures: info?.structures || [], info };
  })();
  return loading;
}

/** A paintable copy of the model: tagged meshes with their own materials. */
export function instantiate(source) {
  const root = source.clone(true);
  root.name = 'astronaut';
  root.traverse((o) => {
    if (!o.isMesh) return;
    const structure = o.name || o.parent?.name;
    const base = BASE_OPACITY[structure] ?? 0.95;
    if (structure === 'skin') {
      o.material = shellMaterial();
      o.material.uniforms.uColor.value.set(SHELL_HEX);
    } else {
      const color = o.material.color.clone();
      color.offsetHSL(0, -0.72, -0.04); // near-neutral base so only status glows carry colour
      o.material = new THREE.MeshStandardMaterial({
        color, emissive: color.clone(), emissiveIntensity: BASE_EMISSIVE, roughness: 0.6, metalness: 0,
        transparent: true, opacity: base, depthWrite: base > 0.6,
      });
    }
    o.userData = { structure, baseOpacity: base, baseEmissive: BASE_EMISSIVE, opacity: base, target: base,
      baseColor: o.material.emissive?.clone() };
    o.renderOrder = structure === 'skin' ? 10 : base < 0.6 ? 2 : 1;
  });
  return root;
}

/** The procedural placeholder, prepared the same way (used if the GLB can't load). */
export function placeholderBody() {
  const root = buildBody();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.opacity = o.userData.baseOpacity;
    o.userData.target = o.userData.baseOpacity;
    o.userData.baseColor = o.material.emissive?.clone();
  });
  return root;
}

/**
 * Set each mesh's target opacity and emissive colour.
 * - selected region: its organs/nerves at full strength in the region's status colour, the rest faded
 * - otherwise: structures of out-of-range regions glow steadily (alert/watch colour) — no animation
 */
export function paint(meshes, statuses, selected) {
  const organ = selected ? ORGAN_BY_ID[selected] : null;
  const involved = new Set(organ?.structures || []);
  const selColor = new THREE.Color(STATUS_HEX[statuses?.[selected]] ?? STATUS_HEX.normal);
  const critical = criticalStructures(statuses);
  for (const m of meshes) {
    const d = m.userData;
    const s = d.structure;
    let glow = null, strength = 0;
    if (organ) {
      const isIn = involved.has(s);
      d.target = isIn ? (s === 'skin' ? 1.4 : 1) : (s === 'skin' ? 0.35 : 0.05);
      if (isIn) { glow = selColor; strength = { alert: 0.65, watch: 0.5 }[statuses?.[selected]] ?? 0.22; }
    } else {
      const st = critical[s];
      d.target = st ? Math.max(d.baseOpacity, s === 'skin' ? 1.3 : 0.98) : d.baseOpacity;
      if (st) { glow = new THREE.Color(STATUS_HEX[st]); strength = st === 'alert' ? 0.75 : 0.45; }
    }
    if (m.material.uniforms) m.material.uniforms.uColor.value.set(glow ?? SHELL_HEX);
    else if (m.material.emissive) {
      if (glow) { m.material.emissive.copy(glow); m.material.emissiveIntensity = strength; }
      else { m.material.emissive.copy(d.baseColor); m.material.emissiveIntensity = d.baseEmissive; }
    }
  }
}

/** Apply target opacities immediately (thumbnails, reduced motion). */
export function settle(meshes) {
  for (const m of meshes) {
    const d = m.userData;
    d.opacity = d.target;
    if (m.material.uniforms) m.material.uniforms.uOpacity.value = d.opacity;
    else m.material.opacity = Math.min(1, d.opacity);
    m.visible = d.opacity > 0.01;
  }
}

export function meshesOf(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xf2efea, 0x120c0c, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(1.5, 3, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd8e8e5, 0.4);
  fill.position.set(-3, 1.5, 1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xc5003c, 0.4);
  rim.position.set(-2, 1, -3);
  scene.add(rim);
}
