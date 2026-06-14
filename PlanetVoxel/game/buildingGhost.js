import {
  Mesh, Group, BasicMaterial, geometryFromData,
  boxData, cylinderData, coneData, octahedronData, dodecahedronData,
  Vec3, Quat,
} from '../engine.js';

// Per-type half-heights so the ghost/placement sits fully above the surface
export const BUILDING_HALF_H = {
  extractor: 0.9, crusher: 0.7, smelter: 1.1, fabricator: 1.0,
  assembler: 1.1, storage: 0.5, terminal: 1.0, generator: 0.8,
  pylon: 1.5, sorter: 0.3,
};

// Returns primitive geometry DATA for a building type (the caller builds an
// engine Geometry from it with its device).
export function getBuildingData(type) {
  switch (type) {
    case 'extractor':  return cylinderData(0.6, 0.9, 1.8, 6);
    case 'crusher':    return boxData([1.4, 1.4, 1.4]);
    case 'smelter':    return cylinderData(0.5, 0.8, 2.2, 8);
    case 'fabricator': return octahedronData(1.0);
    case 'assembler':  return dodecahedronData(1.1);
    case 'storage':    return boxData([1.6, 1.0, 1.6]);
    case 'terminal':   return boxData([1.0, 2.0, 0.3]);
    case 'generator':  return cylinderData(0.7, 0.7, 1.6, 8);
    case 'pylon':      return coneData(0.3, 3.0, 8);
    case 'sorter':     return boxData([1.2, 0.6, 1.2]);
    default:           return boxData([1.2, 1.2, 1.2]);
  }
}

// Manages the translucent "ghost" preview mesh shown while placing or moving
// a building.
export class BuildingGhost {
  constructor(scene) {
    this.scene = scene;
    this.device = scene.device;
    this.group = null;
    this.ghostMat = new BasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghostEdgeMat = new BasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.8, wireframe: true, depthWrite: false });
  }

  clear() {
    if (this.group) {
      // Free the per-instance geometry created for this preview.
      for (const child of this.group.children) if (child.geometry) child.geometry.destroy();
      this.scene.remove(this.group);
      this.group = null;
    }
  }

  update(type, pos, normal, yaw) {
    this.clear();
    if (!type || !pos) return;
    const data = getBuildingData(type);
    // Wireframe needs its own line-list geometry; the solid uses triangles.
    const geo = geometryFromData(this.device, data);
    const wireGeo = geometryFromData(this.device, data);
    const mesh = new Mesh(geo, this.ghostMat);
    const wire = new Mesh(wireGeo, this.ghostEdgeMat);
    this.group = new Group();
    this.group.add(mesh);
    this.group.add(wire);
    this.group.position.copy(pos);
    const worldUp = new Vec3(0, 1, 0);
    const q = new Quat().setFromUnitVectors(worldUp, normal);
    const qYaw = new Quat().setFromAxisAngle(normal, yaw);
    let orient = qYaw.multiply(q);
    if (type === 'extractor') {
      orient = orient.multiply(new Quat().setFromAxisAngle(new Vec3(1, 0, 0), Math.PI));
    }
    this.group.setRotationFromQuaternion(orient);
    this.scene.add(this.group);
  }
}
