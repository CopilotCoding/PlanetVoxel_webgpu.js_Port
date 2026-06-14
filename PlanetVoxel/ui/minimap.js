import {
  OrthographicCamera, Mesh, BasicMaterial, geometryFromData, coneData, Vec3, Quat,
} from '../engine.js';
import { PLANET_RADIUS } from '../constants.js';

// Minimap-only objects (the player marker) live on this layer bit so they're
// invisible to the main first-person camera (mask 0x1) but visible to the
// minimap camera (mask 0x1 | MINIMAP_LAYER). Terrain/buildings stay on the
// default layer 0x1.
export const MINIMAP_LAYER = 0x2;

export class Minimap {
  constructor(scene) {
    this.scene = scene;

    const VIEW_SIZE = PLANET_RADIUS * 1.1;
    this.camera = new OrthographicCamera(scene.device, {
      left: -VIEW_SIZE, right: VIEW_SIZE, bottom: -VIEW_SIZE, top: VIEW_SIZE,
      near: 0.1, far: PLANET_RADIUS * 4,
    });
    // The minimap camera sees the default layer + the minimap-only layer.
    this.layerMask = 0x1 | MINIMAP_LAYER;

    // Player marker — a bright cone, drawn on top (depthTest off) on the
    // minimap layer so the main camera never shows it.
    this.playerMarker = new Mesh(
      geometryFromData(scene.device, coneData(3, 8, 8)),
      new BasicMaterial({ color: 0x88ddff, fog: false, depthTest: false, depthWrite: false }),
    );
    this.playerMarker.layers = MINIMAP_LAYER;
    this.playerMarker.frustumCulled = false;
    this.playerMarker.renderOrder = 999;
    scene.add(this.playerMarker);

    this.northPolePos = new Vec3(0, PLANET_RADIUS, 0);
    this.southPolePos = new Vec3(0, -PLANET_RADIUS, 0);
    this.northEl = document.getElementById('minimap-pole-north');
    this.southEl = document.getElementById('minimap-pole-south');

    this._up = new Vec3(0, 1, 0); // scratch
  }

  // playerPos/playerUp/forwardDir: Vec3.
  update(playerPos, playerUp, forwardDir) {
    const camAltitude = PLANET_RADIUS * 2.2;
    this.camera.position = playerUp.clone().multiplyScalar(camAltitude);
    this.camera.up = forwardDir.clone();
    this.camera.target = playerPos.clone();
    this.camera.update();

    // Orient the marker: cone tip (+Y) points along forwardDir, lying flat on
    // the tangent plane just above the surface. Build the orientation from a
    // basis where +Y maps to forwardDir.
    this.playerMarker.position.copy(playerPos).addScaledVector(playerUp, 2);
    this.playerMarker.quaternion.setFromUnitVectors(new Vec3(0, 1, 0), forwardDir.clone().normalize());

    const right = new Vec3().crossVectors(forwardDir, playerUp).normalize();
    this._updatePoleOverlay(playerPos, playerUp, forwardDir, right);
  }

  _updatePoleOverlay(playerPos, playerUp, forwardDir, right) {
    this._placePoleDot(this.northEl, this.northPolePos, playerPos, playerUp, forwardDir, right);
    this._placePoleDot(this.southEl, this.southPolePos, playerPos, playerUp, forwardDir, right);
  }

  _placePoleDot(el, poleWorldPos, playerPos, playerUp, forwardDir, right) {
    if (!el) return;
    const toPole = poleWorldPos.clone().sub(playerPos);
    toPole.addScaledVector(playerUp, -toPole.dot(playerUp));
    if (toPole.lengthSq() < 1e-6) {
      el.style.left = '50%';
      el.style.top = '50%';
      return;
    }
    toPole.normalize();

    const fy = toPole.dot(forwardDir);
    const fx = toPole.dot(right);

    const RADIUS = 0.92;
    const px = (fx * RADIUS * 0.5 + 0.5) * 100;
    const py = (1 - (fy * RADIUS * 0.5 + 0.5)) * 100;
    el.style.left = px + '%';
    el.style.top = py + '%';
  }
}
