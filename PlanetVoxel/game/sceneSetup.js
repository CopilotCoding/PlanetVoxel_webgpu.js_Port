import {
  createDevice, SceneRenderer, Scene, Fog, Mesh, Group,
  AmbientLight, PointLight, BasicMaterial, PointsMaterial,
  Geometry, sphereData, geometryFromData, Vec3,
} from '../engine.js';
import { PLANET_RADIUS } from '../constants.js';

// Builds the renderer, scene, star field, lighting rig (ambient/sun/lantern)
// and atmosphere glow. Returns everything the main loop needs to drive the
// day/night cycle and lighting uniforms each frame.
//
// Async now: acquiring the WebGPU device is async, so callers await setupScene().
export async function setupScene() {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.insertBefore(canvas, document.body.firstChild);

  const device = await createDevice();
  const renderer = new SceneRenderer(device, canvas, { antialias: true });
  renderer.domElement = canvas; // Three-compat: main.js refers to renderer.domElement

  const scene = new Scene();
  scene.device = device; // game modules reach the device via scene.device
  scene.background.setHex(0x000008);
  scene.fog = new Fog(0x000008, 300, 600);

  // Stars — a Points cloud on a far shell.
  const starVerts = [];
  for (let i = 0; i < 6000; i++) {
    const r = 800 + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starVerts.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    );
  }
  const starGeo = new Geometry(device, { attributes: { position: { format: 'float32x3', data: new Float32Array(starVerts) } } });
  scene.add(new Mesh(starGeo, new PointsMaterial({ color: 0xffffff, size: 1.6, depthWrite: false })));

  // Sun shadows: a single directional shadow map covering the whole planet.
  // Enabled here; the per-frame sun direction is fed in the main loop. (Points
  // never cast; the sun/atmosphere meshes below opt out via castShadow:false.)
  renderer.enableShadows({
    size: 2048,
    bounds: { min: [-PLANET_RADIUS - 30, -PLANET_RADIUS - 30, -PLANET_RADIUS - 30], max: [PLANET_RADIUS + 30, PLANET_RADIUS + 30, PLANET_RADIUS + 30] },
  });

  // Near-zero ambient — dark side is total darkness, only the lantern lights locally.
  const ambientLight = new AmbientLight(0x111133, 0.03);
  scene.add(ambientLight);

  // Sun point light: warm, no distance falloff (decay 0).
  const sunLight = new PointLight(0xfff5e0, 2.0, 0, 0);
  scene.add(sunLight);

  const SUN_RADIUS = 28;
  const SUN_ORBIT = PLANET_RADIUS * 3.8;

  // Sun core + two additive coronas as a Group, so coronas follow the core.
  const sunCoreMesh = new Group();
  sunCoreMesh.frustumCulled = false;
  // Core: opaque-looking but depthWrite OFF so the larger additive corona
  // spheres (same center) don't depth-fight it — looking straight at the sun
  // otherwise made the corona's far hemisphere get depth-rejected by the core,
  // changing the apparent brightness. Terrain still occludes the sun (terrain
  // writes depth first), so the sun correctly hides behind hills.
  // Matches the original exactly: opaque white core (no fog), two additive
  // coronas (depthWrite off, no fog). depthWrite stays on for the core so
  // terrain occludes the sun normally.
  const core = new Mesh(geometryFromData(device, sphereData(SUN_RADIUS, 20, 20)), new BasicMaterial({ color: 0xffffff, fog: false, castShadow: false }));
  core.frustumCulled = false;
  sunCoreMesh.add(core);
  const c1 = new Mesh(
    geometryFromData(device, sphereData(SUN_RADIUS * 1.6, 20, 20)),
    new BasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.12, blending: 'additive', depthWrite: false, fog: false, castShadow: false }),
  );
  c1.frustumCulled = false;
  sunCoreMesh.add(c1);
  const c2 = new Mesh(
    geometryFromData(device, sphereData(SUN_RADIUS * 2.6, 20, 20)),
    new BasicMaterial({ color: 0x8899ff, transparent: true, opacity: 0.06, blending: 'additive', depthWrite: false, fog: false, castShadow: false }),
  );
  c2.frustumCulled = false;
  sunCoreMesh.add(c2);
  scene.add(sunCoreMesh);

  const SUN_PERIOD = 180;

  // Lantern point light — warm, quadratic falloff (decay 1).
  const lantern = new PointLight(0xffcc77, 2.5, 18, 1);
  scene.add(lantern);
  lantern.position.set(0, PLANET_RADIUS + 4 + 1.2, 0);

  // Atmosphere glow — BackSide so it renders viewed from inside the sphere.
  const atmosMesh = new Mesh(
    geometryFromData(device, sphereData(210, 32, 32)),
    new BasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.08, side: 'back', blending: 'additive', depthWrite: false, castShadow: false }),
  );
  atmosMesh.frustumCulled = false;
  scene.add(atmosMesh);

  return {
    renderer, scene, device,
    ambientLight, sunLight, sunCoreMesh, lantern, atmosMesh,
    SUN_ORBIT, SUN_PERIOD,
  };
}

// Places the sun at `sunAngle` along its tilted orbit. Pure math (Vec3 in/out).
export function placeSun(sunCoreMesh, sunAngle, SUN_ORBIT) {
  const tilt = Math.PI / 5.2;
  sunCoreMesh.position.set(
    Math.cos(sunAngle) * SUN_ORBIT,
    Math.sin(sunAngle) * Math.sin(tilt) * SUN_ORBIT,
    Math.sin(sunAngle) * Math.cos(tilt) * SUN_ORBIT,
  );
}
