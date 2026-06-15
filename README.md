# Planet Voxel (WebGPU)

A browser voxel mining + factory game running on a custom WebGPU engine
(`webgpu.js`). The game (`PlanetVoxel/`) imports the engine from the sibling
`webgpu.js/` folder, so both must be served together from this root directory.

## Requirements

- A browser with **WebGPU**: Chrome/Edge 113+, or Firefox 141+ (Windows).
- A static file server (no build step — plain ES modules). ES modules can't be
  loaded from `file://`, so you must serve over HTTP.

## Run it

From this directory (the one containing `PlanetVoxel/` and `webgpu.js/`):

```bash
python -m http.server 3000
```

or, if you prefer Node:

```bash
npx serve . -l 3000
```

Then open:

```
http://localhost:3000/PlanetVoxel/index.html
```

Create a world from the menu and play.

> **Important:** serve this **root** folder, not `PlanetVoxel/` — the game loads
> the engine via `../webgpu.js/...`, which only resolves when the root is the
> server root.

## Controls

- **Click** the canvas to capture the mouse (pointer lock); **Esc** to release.
- **WASD** move, **Space** jump / **hold** for jetpack.
- **Left-click** mine / use the selected terrain tool; **1–4** (or scroll) pick a tool.
- **Right-click** place a building (with a build type selected), or connect a belt
  between two buildings (with nothing selected).
- **B** build menu, **I** inventory, **M** market, **T** tech tree, **F** factory.
- Looking at a building: **E** feed, **V** view/empty, **G** move, **C** cut belts
  (removes belts touching it without demolishing), **X** demolish.
- **R** rotate while placing/moving a building.
- **P** pause.

## Troubleshooting

- **Blank page / module errors:** you're probably serving `PlanetVoxel/` instead
  of the root — serve the root so `../webgpu.js/` resolves.
- **"WebGPU is not supported":** use a current Chrome/Edge, or Firefox 141+.
- **Changes don't take effect after editing:** a stale server process on another
  port can serve old files — kill it and restart on a fresh port.
