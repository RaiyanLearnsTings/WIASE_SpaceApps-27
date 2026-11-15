// Procedural placeholder anatomy (metres, feet at y = 0, facing +z). Every mesh is tagged with
// userData.structure so the viewer can isolate organs and nerves. Swap for a .glb later by tagging
// its meshes with the same structure keys (see organs.mjs STRUCTURES).
import * as THREE from '../../vendor/three/three.module.min.js';

const COLORS = {
  shell: 0x7fb6d9,
  bone: 0xc9d6de,
  brain: 0xe9a6b4,
  heart: 0xd9443a,
  vessel: 0xc8372f,
  lungs: 0xe58f8f,
  nerve: 0xf2c94c,
  ear: 0xd7b9a0,
  marrow: 0xb06a5a,
};

// Fresnel "hologram" shell: bright at silhouette edges, nearly clear when facing the camera.
export function shellMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(COLORS.shell) }, uOpacity: { value: 1 } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
        gl_FragColor = vec4(uColor, (0.04 + 0.55 * rim) * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function solid(color, opacity = 0.92, emissive = 0.18) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: emissive, roughness: 0.55, metalness: 0.05,
    transparent: true, opacity,
  });
}

function tag(mesh, structure, baseOpacity) {
  mesh.userData.structure = structure;
  mesh.userData.baseOpacity = baseOpacity;
  mesh.userData.baseEmissive = mesh.material.emissiveIntensity ?? 0;
  mesh.renderOrder = structure === 'skin' ? 10 : 1;
  return mesh;
}

/** Capsule between two points. */
function limb(a, b, radius, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const length = start.distanceTo(end);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius), 8, 16), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return mesh;
}

function ellipsoid(radius, scale, position, material, segments = 32) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.75)), material);
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  return mesh;
}

function tube(points, radius, material, segments = 48) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), material);
}

// Joint positions shared by skin, arteries and nerves (left = +x, the astronaut's left).
const J = {
  shoulderL: [0.2, 1.42, 0], elbowL: [0.27, 1.14, -0.01], wristL: [0.31, 0.89, 0.02],
  shoulderR: [-0.2, 1.42, 0], elbowR: [-0.27, 1.14, -0.01], wristR: [-0.31, 0.89, 0.02],
  hipL: [0.095, 0.93, 0], kneeL: [0.105, 0.5, 0.01], ankleL: [0.1, 0.08, -0.01],
  hipR: [-0.095, 0.93, 0], kneeR: [-0.105, 0.5, 0.01], ankleR: [-0.1, 0.08, -0.01],
};

export function buildBody() {
  const root = new THREE.Group();
  root.name = 'astronaut';
  const add = (mesh, structure, opacity) => { root.add(tag(mesh, structure, opacity)); return mesh; };

  // ---- skin shell -----------------------------------------------------------------------
  const skin = () => { const m = shellMaterial(); return m; };
  add(ellipsoid(0.105, [0.92, 1.12, 1.0], [0, 1.635, 0], skin()), 'skin', 1);
  add(limb([0, 1.47, 0], [0, 1.56, 0.005], 0.052, skin()), 'skin', 1);
  const torsoProfile = [
    [0.0, 0.86], [0.13, 0.87], [0.175, 0.93], [0.18, 1.0], [0.155, 1.08], [0.158, 1.16],
    [0.172, 1.26], [0.185, 1.36], [0.19, 1.41], [0.16, 1.455], [0.07, 1.485], [0.0, 1.49],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 48), skin());
  torso.scale.set(1, 1, 0.62);
  add(torso, 'skin', 1);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    add(limb(J[`shoulder${side}`], J[`elbow${side}`], 0.047, skin()), 'skin', 1);
    add(limb(J[`elbow${side}`], J[`wrist${side}`], 0.039, skin()), 'skin', 1);
    add(ellipsoid(0.045, [0.55, 1.15, 0.85], [0.325 * s, 0.82, 0.025], skin(), 16), 'skin', 1);
    add(limb(J[`hip${side}`], J[`knee${side}`], 0.072, skin()), 'skin', 1);
    add(limb(J[`knee${side}`], J[`ankle${side}`], 0.052, skin()), 'skin', 1);
    add(ellipsoid(0.05, [0.85, 0.5, 1.9], [0.1 * s, 0.035, 0.05], skin(), 16), 'skin', 1);
  }

  // ---- skeleton hints -------------------------------------------------------------------
  const bone = solid(COLORS.bone, 0.32, 0.05);
  for (let i = 0; i < 17; i++) {
    const y = 0.98 + i * 0.033;
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.026), bone.clone());
    v.position.set(0, y, -0.072 + Math.sin(i / 3) * 0.006);
    add(v, 'spine_bones', 0.32);
  }
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.135 - Math.abs(i - 2) * 0.006, 0.005, 6, 40, Math.PI * 1.55), bone.clone());
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.725);
    rib.scale.set(1, 0.62, 1);
    rib.position.set(0, 1.19 + i * 0.038, -0.01);
    add(rib, 'spine_bones', 0.32);
  }

  // ---- bone marrow (pelvis + femurs) ----------------------------------------------------
  const pelvis = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 36), solid(COLORS.marrow, 0.55, 0.12));
  pelvis.rotation.x = Math.PI / 2.4;
  pelvis.scale.set(1.15, 0.75, 1);
  pelvis.position.set(0, 0.94, -0.01);
  add(pelvis, 'marrow', 0.55);
  for (const side of ['L', 'R']) {
    add(limb(J[`hip${side}`], J[`knee${side}`], 0.017, solid(COLORS.marrow, 0.55, 0.12)), 'marrow', 0.55);
  }

  // ---- brain ----------------------------------------------------------------------------
  for (const s of [1, -1]) {
    add(ellipsoid(0.07, [0.62, 0.78, 1.18], [0.037 * s, 1.672, -0.005], solid(COLORS.brain, 0.95, 0.22)), 'brain', 0.95);
  }
  add(limb([0, 1.62, -0.02], [0, 1.55, -0.04], 0.016, solid(COLORS.brain, 0.95, 0.22)), 'brainstem', 0.95);
  add(ellipsoid(0.012, [1, 1, 1], [0, 1.635, 0.005], solid(0xffa86b, 0.95, 0.4), 12), 'hypothalamus', 0.95);

  // ---- ears -----------------------------------------------------------------------------
  for (const s of [1, -1]) {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, 8, 20), solid(COLORS.ear, 0.9, 0.2));
    ear.position.set(0.098 * s, 1.63, -0.005);
    ear.rotation.y = Math.PI / 2;
    add(ear, 'ears', 0.9);
  }

  // ---- thorax ---------------------------------------------------------------------------
  const heart = ellipsoid(0.05, [1, 1.18, 0.9], [0.028, 1.275, 0.035], solid(COLORS.heart, 0.96, 0.3));
  heart.rotation.z = -0.45;
  add(heart, 'heart', 0.96);
  add(ellipsoid(0.072, [0.8, 1.55, 0.95], [-0.085, 1.3, -0.005], solid(COLORS.lungs, 0.62, 0.15)), 'lungs', 0.62);
  add(ellipsoid(0.066, [0.78, 1.5, 0.95], [0.098, 1.3, -0.01], solid(COLORS.lungs, 0.62, 0.15)), 'lungs', 0.62);
  add(tube([[0, 1.53, 0.025], [0, 1.45, 0.02], [0, 1.38, 0.01]], 0.011, solid(0xdcc6c0, 0.85, 0.15)), 'trachea', 0.85);

  // ---- vessels --------------------------------------------------------------------------
  add(tube([[0.02, 1.3, 0.04], [0.02, 1.37, 0.03], [-0.005, 1.395, 0.0], [-0.02, 1.37, -0.035],
    [-0.015, 1.25, -0.045], [-0.01, 1.0, -0.04]], 0.0095, solid(COLORS.vessel, 0.95, 0.3)), 'aorta', 0.95);
  add(tube([[0.0, 1.39, 0.01], [0.09, 1.415, 0.01], J.shoulderL, J.elbowL, J.wristL].map(
    (p) => [p[0], p[1], p[2] + 0.012]), 0.0055, solid(COLORS.vessel, 0.95, 0.3)), 'arm_artery', 0.95);

  // ---- nerves ---------------------------------------------------------------------------
  const nerve = () => solid(COLORS.nerve, 0.55, 0.5);
  add(tube([[0, 1.56, -0.045], [0, 1.4, -0.06], [0, 1.2, -0.063], [0, 1.0, -0.06]], 0.0065, nerve()), 'spinal_cord', 0.55);
  for (const s of [1, -1]) {
    add(tube([[0.018 * s, 1.58, -0.025], [0.032 * s, 1.47, 0.0], [0.03 * s, 1.36, 0.025],
      [0.025 * s, 1.27, 0.045], [0.02 * s, 1.12, 0.03]], 0.0035, nerve()), 'vagus', 0.55);
    add(tube([[0.03 * s, 1.5, -0.01], [0.05 * s, 1.38, 0.01], [0.075 * s, 1.24, 0.01], [0.08 * s, 1.16, 0.0]],
      0.003, nerve()), 'phrenic', 0.55);
    add(tube([[0.095 * s, 1.63, -0.005], [0.05 * s, 1.615, -0.02], [0.012 * s, 1.6, -0.03]], 0.003, nerve()), 'auditory_nerve', 0.55);
    const side = s > 0 ? 'L' : 'R';
    add(tube([[0.0, 1.47, -0.05], [0.1 * s, 1.45, -0.02], J[`shoulder${side}`], J[`elbow${side}`], J[`wrist${side}`]].map(
      (p) => [p[0], p[1], p[2] - 0.012]), 0.0035, nerve()), 'arm_nerve', 0.55);
  }

  return root;
}

export const BODY_CENTER = new THREE.Vector3(0, 0.95, 0);
