import { PerspectiveCamera, Vec3 } from './engine.js';

export class Camera {
  // Pass an AbortSignal so the resize listener is removed when the play
  // session ends.
  constructor(renderer, signal) {
    this.renderer = renderer;
    this.camera = new PerspectiveCamera(renderer.device, {
      fov: 80 * Math.PI / 180,
      aspect: window.innerWidth / window.innerHeight,
      near: 0.3,
      far: 2000,
    });
    this.yaw   = 0;
    this.pitch = 0;
    this._fwd     = new Vec3(0, 0, -1);
    this._right   = new Vec3(1, 0, 0);
    this._up      = new Vec3(0, 1, 0);
    this._lookDir = new Vec3(0, 0, -1);
    // Persistent "north" tangent vector — parallel-transported each frame to avoid
    // any discontinuity when up crosses the (0,1,0) axis.
    this._north = new Vec3(0, 0, -1);

    // Smoothed radial (altitude) distance from the planet center, used for
    // the camera's eye height only — smooths residual slope-mesh jitter.
    this._smoothAltitude = null;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.camera.setViewport(0, 0, window.innerWidth, window.innerHeight);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }, { signal });
  }

  rotate(dx, dy) {
    this.yaw   += dx * 0.002;
    this.pitch -= dy * 0.002;
    this.pitch  = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
  }

  update(playerPos, playerUp) {
    const up = playerUp.clone().normalize();
    this._up.copy(up);

    // Parallel-transport _north: remove its component along the new up vector,
    // then renormalize.
    this._north.addScaledVector(up, -this._north.dot(up));
    if (this._north.lengthSq() < 1e-8) {
      const arb = Math.abs(up.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 0, 1);
      this._north.crossVectors(up, arb);
    }
    this._north.normalize();

    const baseRight = new Vec3().crossVectors(this._north, up).normalize();
    const baseFwd   = this._north.clone(); // snapshot; _north must not be modified below

    // Apply yaw (rotate around local up)
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const yawFwd   = baseFwd.clone().multiplyScalar(cy).addScaledVector(baseRight, sy);
    const yawRight = baseRight.clone().multiplyScalar(cy).addScaledVector(baseFwd.clone().negate(), sy);

    this._fwd.copy(yawFwd);
    this._right.copy(yawRight);

    // Apply pitch for look direction
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._lookDir.copy(yawFwd).multiplyScalar(cp).addScaledVector(up, sp).normalize();

    // Position camera at player eye level
    const EYE = 1.55;
    const eyePos = playerPos.clone().addScaledVector(up, EYE);

    // Smooth only the radial (altitude) component of the eye position.
    const altitude = eyePos.length();
    if (this._smoothAltitude === null) this._smoothAltitude = altitude;
    this._smoothAltitude += (altitude - this._smoothAltitude) * 0.3;
    eyePos.setLength(this._smoothAltitude);

    this.camera.position = eyePos;
    this.camera.up = up;
    this.camera.target = eyePos.clone().add(this._lookDir);
    this.camera.update();
  }

  getForwardDir() { return this._fwd.clone(); }
  getRightDir()   { return this._right.clone(); }
  getLookDir()    { return this._lookDir.clone(); }

  getRayFromCenter() {
    return {
      origin:    this.camera.position.clone(),
      direction: this._lookDir.clone(),
    };
  }
}
