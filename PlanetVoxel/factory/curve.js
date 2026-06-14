import { Vec3 } from '../engine.js';

// A small polyline curve with arc-length-parameterized getPointAt/getTangentAt,
// replacing the THREE.CatmullRomCurve3 the belts used for placing items and
// direction arrows along the tube. The belt path is already a finely-sampled
// arc (the belt builds ~steps points), so treating it as a polyline and
// sampling by arc length is visually identical and far simpler than a spline.

export class PolyCurve {
  constructor(points) {
    this.points = points.map((p) => p.clone ? p.clone() : new Vec3(p.x, p.y, p.z));
    // Cumulative arc lengths for arc-length parameterization.
    this._cum = [0];
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += this.points[i].distanceTo(this.points[i - 1]);
      this._cum.push(total);
    }
    this.length = total || 1;
  }

  // Returns the segment index + local fraction for arc-length t in [0,1].
  _locate(t) {
    const target = Math.max(0, Math.min(1, t)) * this.length;
    let i = 1;
    while (i < this._cum.length && this._cum[i] < target) i++;
    const i0 = Math.max(0, i - 1), i1 = Math.min(this.points.length - 1, i);
    const segLen = this._cum[i1] - this._cum[i0] || 1;
    const f = (target - this._cum[i0]) / segLen;
    return { i0, i1, f };
  }

  getPointAt(t) {
    const { i0, i1, f } = this._locate(t);
    return this.points[i0].clone().lerp(this.points[i1], f);
  }

  getTangentAt(t) {
    const { i0, i1 } = this._locate(t);
    return this.points[i1].clone().sub(this.points[i0]).normalize();
  }
}
