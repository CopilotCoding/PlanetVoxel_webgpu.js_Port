import {
  Mesh, LambertMaterial, BasicMaterial, geometryFromData,
  boxData, coneData, tubeData, Vec3, Quat,
} from '../engine.js';
import { PolyCurve } from './curve.js';
import { ALL_ITEMS } from '../constants.js';

const BELT_SPEEDS = { belt_basic: 1.5, belt_fast: 4.5, belt_ultra: 12.0 };
const ITEM_SIZE = 0.18;
let _beltId = 0;

class BeltItem {
  constructor(name, scene) {
    this.name = name;
    this.progress = 0; // 0..1 along belt
    const itemDef = Object.values(ALL_ITEMS).find(i => i.name === name);
    const color = itemDef ? itemDef.color : 0xffffff;
    this.mesh = new Mesh(geometryFromData(scene.device, boxData([ITEM_SIZE, ITEM_SIZE, ITEM_SIZE])), new BasicMaterial({ color }));
    scene.add(this.mesh);
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.destroy();
  }
}

export class Belt {
  constructor(fromBuilding, toBuilding, scene, tier = 'belt_basic') {
    this.id = ++_beltId;
    this.from = fromBuilding;
    this.to = toBuilding;
    this.tier = tier;
    this.scene = scene;
    this.speed = BELT_SPEEDS[tier] || 1.5;
    this.items = [];
    this._buildMesh();
  }

  // Rebuild the tube geometry/curve from the current building positions —
  // called after one of the connected buildings is moved.
  rebuildMesh() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.destroy();
    this._buildMesh();
  }

  _buildMesh() {
    const start = this.from.position.clone();
    const end = this.to.position.clone();
    const dir = end.clone().sub(start);
    const len = dir.length();

    // Tube along a slightly-arced line between buildings.
    const points = [];
    const steps = Math.max(2, Math.ceil(len / 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = start.clone().lerp(end, t);
      const r = p.length();
      p.normalize().multiplyScalar(r + 0.5 * Math.sin(t * Math.PI));
      points.push(p);
    }
    const curve = new PolyCurve(points);
    const tubeGeo = geometryFromData(this.scene.device, tubeData(points.map(p => [p.x, p.y, p.z]), 0.12, 6, steps * 3, false));
    this.mesh = new Mesh(tubeGeo, new LambertMaterial({ color: 0x334466 }));
    this.scene.add(this.mesh);
    this._curve = curve;
    this._curveLen = len;

    this._buildDirectionArrows();
  }

  // Small glowing chevrons laid along the belt pointing toward `to`.
  _buildDirectionArrows() {
    if (this._arrows) {
      for (const a of this._arrows) { this.scene.remove(a); a.geometry.destroy(); }
    }
    this._arrows = [];

    const arrowData = coneData(0.12, 0.32, 4);
    const arrowMat = new BasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85, blending: 'additive', depthWrite: false });

    const count = Math.max(1, Math.min(8, Math.round(this._curveLen / 2)));
    for (let i = 1; i <= count; i++) {
      const arrow = new Mesh(geometryFromData(this.scene.device, arrowData), arrowMat);
      this._arrows.push(arrow);
      this.scene.add(arrow);
    }
    this._positionArrows(0);
  }

  _positionArrows(scrollOffset) {
    const count = this._arrows.length;
    for (let i = 0; i < count; i++) {
      let t = (i + 1) / (count + 1) + scrollOffset;
      t = ((t % 1) + 1) % 1; // wrap into [0,1)
      const pos = this._curve.getPointAt(t);
      const tangent = this._curve.getTangentAt(t).normalize();
      const arrow = this._arrows[i];
      arrow.position.copy(pos).addScaledVector(pos.clone().normalize(), 0.18);
      // Cone's local +Y is its point; align with the flow tangent.
      arrow.quaternion.setFromUnitVectors(new Vec3(0, 1, 0), tangent);
    }
  }

  update(dt) {
    const advanceDist = this.speed * dt;
    const advanceNorm = advanceDist / Math.max(1, this._curveLen);

    this._arrowScroll = ((this._arrowScroll || 0) + advanceNorm * 0.5) % 1;
    this._positionArrows(this._arrowScroll);

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      const ahead = this.items[i + 1];
      const gap = ahead ? ahead.progress - item.progress : 1;
      const minGap = 0.05;
      if (gap > minGap + 0.001) {
        item.progress = Math.min(item.progress + advanceNorm, ahead ? ahead.progress - minGap : 1.0);
      }
      if (item.progress >= 1.0) {
        const ok = this.to.receiveItem(item.name, 1);
        if (ok) {
          item.dispose(this.scene);
          this.items.splice(i, 1);
        } else {
          this.from.outputBuffer[item.name] = (this.from.outputBuffer[item.name] || 0) + 1;
          item.dispose(this.scene);
          this.items.splice(i, 1);
        }
      }
      const pos = this._curve.getPointAt(Math.min(0.9999, item.progress));
      item.mesh.position.copy(pos);
    }
  }

  canPull() {
    return this.items.length === 0 || this.items[0].progress > 0.12;
  }

  tryPull() {
    if (!this.canPull()) return false;
    const outItem = this.from.getFirstOutput(this.to);
    if (!outItem) return false;
    const took = this.from.takeOutput(outItem);
    if (!took) return false;
    const newItem = new BeltItem(outItem, this.scene);
    newItem.progress = 0;
    this.items.unshift(newItem);
    return true;
  }

  setTier(tier) {
    this.tier = tier;
    this.speed = BELT_SPEEDS[tier] || 1.5;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.destroy();
    if (this._arrows) {
      for (const a of this._arrows) { this.scene.remove(a); a.geometry.destroy(); }
      this._arrows = [];
    }
    for (const item of this.items) item.dispose(this.scene);
    this.items = [];
  }
}
