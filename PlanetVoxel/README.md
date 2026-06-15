# Planet Voxel

A browser-based voxel planet mining and factory automation game, in the vein
of Astroneer + Satisfactory. You spawn on a small fully-destructible planet
with smooth marching-cubes terrain, mine raw materials with a pickaxe and
terrain-shaping tools (mine/raise/lower/flatten), sell ore for cash, and use
that cash to build an automated factory: extractors, crushers, smelters,
fabricators, assemblers, conveyor belts, storage, power generators/pylons, and
sorters, all chained together to produce higher-value goods and sell them at
a market terminal. There's a day/night cycle, a jetpack, caves, and a tech
tree gating which buildings/recipes you've unlocked.

Vanilla JS ES modules — no build step. Rendering runs on **`webgpu.js`**, a
custom GPU-driven WebGPU engine that lives in the sibling `../webgpu.js/`
folder. The game was ported off Three.js onto that engine; there is no Three.js
dependency anymore.

## Running locally

> **Serve the repository root** (the folder containing both `PlanetVoxel/` and
> `webgpu.js/`), **not** this `PlanetVoxel/` folder. The game imports the engine
> via `../webgpu.js/...` (see `engine.js`), which only resolves when the root is
> the server root. See the [top-level README](../README.md) for the canonical
> run instructions.

From the repository root:

```
python -m http.server 3000
```

or, with Node.js:

```
npx serve . -l 3000
```

Then open **http://localhost:3000/PlanetVoxel/index.html** and create a world
from the menu.

A current browser with WebGPU is required (Chrome/Edge 113+, or Firefox 141+);
the engine throws an explicit "WebGPU is not supported" error otherwise.

## How rendering is wired (post-port)

The game is a retained-mode app on top of webgpu.js's GPU-driven scene layer:

- **`engine.js`** is the single re-export of every engine type the game uses
  (`SceneRenderer`, `Scene`/`Mesh`/`Group`, `PerspectiveCamera`/`Orthographic
  Camera`, the material/light classes, primitives, `Vec3`/`Quat`/`mat4`). It is
  the one place the `../webgpu.js` path is named.
- The game builds a `Scene` of `Mesh`/`Group` nodes and mutates them in place
  (`mesh.position.copy(...)`, `group.add(...)`); `SceneRenderer` walks the graph
  and draws it through the engine's GPU-driven path (per-pipeline batching, GPU
  frustum cull, indirect draws). The CPU does not iterate meshes to cull/sort/
  draw per frame.
- **Terrain** uses a game-side custom WGSL shader (`terrain/terrainShader.js`)
  via `ShaderMaterial`, with per-vertex `position/normal/color/skyAccess`
  attributes and the sun/lantern/day-night/fog lighting model. This shader is
  the game's, not the engine's — the engine stays game-agnostic.
- The **minimap** is a second `OrthographicCamera` rendered top-down over the
  same scene buffers (the engine's per-camera rendering), not a separate scene.
- **Building selection / belt connection** uses the engine's GPU picker against
  the same world/bounds buffers the renderer uses, so picks agree with what's
  drawn.

## The headaches (lessons learned the hard way)

These ate the most debugging time and are worth knowing before touching the
related code. The first three predate the WebGPU port but the fixes still stand;
the last two are port-era.

1. **The sun is a `PointLight` at the sun's position, not a directional light.**
   A directional sun lit the *inside* of caves and tunnels too, because a
   directional light has no occlusion concept without shadow maps. A point light
   at the sun's position (the engine's `PointLight` with effectively infinite
   range) means tunnel walls facing inward naturally get near-zero light — no
   shadow maps needed. Combined with the terrain shader's per-vertex
   `skyAccess` term (precomputed open-sky visibility), this gives convincing
   "sunlight doesn't reach underground" for free. Real directional **sun shadow
   maps** (multiplying the sun term on top of `skyAccess`, lantern unshadowed)
   are a planned addition on top of the engine's `ShadowMap` — not yet wired in.

2. **Underground/cave detection needs a real upward raycast, not fixed height
   samples.** The original detector checked density at 3 fixed heights above the
   player and required all three solid — broken in most cave shapes. Worse, the
   bug was *masked* on the night side because the lantern also turns on when
   `dayDot < 0`, so "it works at night" was a false positive. Fixed by stepping
   a raycast straight up from the player (1–30 units) and checking for any solid
   voxel (a ceiling) along the way.

3. **Tool-flattened/raised/lowered terrain caused huge walking hops.** Marching
   cubes only samples density at integer lattice points, where the terrain-tool
   math was exact and flat — but the player's collision probes sample density at
   *continuous* positions, where the full noise field still applied. Fixed with
   a separate `_shellTargetR` map: voxels fully snapped by raise/lower/flatten
   store their target radius, and `density()` returns the exact shell formula
   for continuous queries near them, bypassing noise. Scoping this to *only*
   fully-flattened voxels (not mining overrides) was itself the fix for a
   fall-through regression.

4. **Per-material `fog: false` must actually be honored, or the sun vanishes
   when you look at it.** After the port, looking straight at the sun made it
   dim to nothing. Root cause: the batched scene shaders ignored a material's
   `fog: false`, so the sun mesh (very far away) got fogged to the background
   color. The engine fix was per-pipeline fog state keyed into the batch. The
   broader lesson (now in project memory): for silent rendering bugs, read the
   actual values / diff the working original instead of guessing.

5. **Extractors must dig past caves, and belts must be removable without
   demolishing.** Extractors that hit open cave air used to stall there; they
   now advance the drill frontier through voids (with stuck-detection so they
   don't skip solid pieces). Belts can be cut with **[C]** while looking at a
   building, removing belts touching it without destroying the building.

## If your changes don't seem to take effect

This has bitten this project repeatedly — both times it cost a full debugging
session chasing a "bug" that was never in the running code:

- An old `python -m http.server` (or `npx serve`) process kept running in the
  background on a port the browser was no longer pointed at, so every
  hard-reload was fetching old files from a stale server.

The pattern: code fixes appear to have **zero visible effect**, including
correct ones, no matter how many hard-reloads. **Don't** keep re-diagnosing the
code — kill any leftover server processes and restart on a fresh port first.
(With the port now split across two folders, also double-check you're serving
the **root**, not `PlanetVoxel/`, or the engine imports 404.)

## Notes

- Requires a local server (not `file://`) — the game loads ES modules and
  fetches the marching-cubes lookup tables.
- All assets are generated/synthesized at runtime — no build tools needed.
- Marching-cubes lookup tables originally from
  https://github.com/Tsarpf/proced/blob/master/marching-cubes.js
