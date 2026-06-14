import { GPUPicker } from '../../webgpu.js/src/picking/GPUPicker.js';

// GPU crosshair/ray picking over the factory's buildings. Maintains a
// world-matrix buffer + a local-AABB bounds buffer (one slot per building, in
// factory.buildings order) and feeds them to the engine's GPUPicker. Rebuilt
// whenever the building set changes; pick(ray) resolves to the hit Building or
// null.
//
// Each building's pick bounds is a uniform local box big enough to cover any
// building primitive (they're all within ~±1.5 of their group origin); the
// world matrix is the building group's world transform. This matches "ray vs.
// the building you're looking at" closely enough for selection.

const CAPACITY = 1024;        // max buildings pickable
const HALF = 1.3;             // local AABB half-extent per building

export class BuildingPicker {
  constructor(device) {
    this.device = device;
    this.worldBuffer = device.resources.createBuffer({
      size: CAPACITY * 64,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.boundsBuffer = device.resources.createBuffer({
      size: CAPACITY * 32, // vec3 min + pad, vec3 max + pad
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.picker = new GPUPicker(device, { worldBuffer: this.worldBuffer, boundsBuffer: this.boundsBuffer, objectCount: 0 });
    this._buildings = [];
  }

  // Rebuilds the world/bounds buffers from the current building list. Call when
  // buildings are placed, moved, or removed.
  sync(buildings) {
    this._buildings = buildings;
    const n = Math.min(buildings.length, CAPACITY);
    const world = new Float32Array(n * 16);
    const bounds = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const g = buildings[i].group;
      g.updateWorldMatrix(g.parent ? g.parent.worldMatrix : null);
      world.set(g.worldMatrix, i * 16);
      // Local AABB centered on the group origin.
      bounds.set([-HALF, -HALF, -HALF, 0, HALF, HALF, HALF, 0], i * 8);
    }
    if (n > 0) {
      this.device.queue.writeBuffer(this.worldBuffer.gpuBuffer, 0, world);
      this.device.queue.writeBuffer(this.boundsBuffer.gpuBuffer, 0, bounds);
    }
    this.picker.setObjectCount(n);
  }

  get busy() { return this.picker.busy; }

  // ray: { origin, direction } where each is a Vec3 ({x,y,z}) or [x,y,z].
  // GPUPicker needs plain arrays (it uses Float32Array.set), so coerce here.
  // Resolves to a Building, null, or undefined (pick already in flight).
  async pick(ray) {
    const toArr = (v) => Array.isArray(v) ? v : [v.x, v.y, v.z];
    const hit = await this.picker.pick({ origin: toArr(ray.origin), direction: toArr(ray.direction), tMax: ray.tMax });
    if (hit === undefined) return undefined;
    if (!hit) return null;
    return this._buildings[hit.objectIndex] || null;
  }
}
