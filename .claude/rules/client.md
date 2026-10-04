---
paths:
  - "packages/client/**"
---

# Client rules

- The client never decides outcomes. It sends inputs and renders interpolated server state.
- Performance budget is in `docs/ART_STYLE.md`. Stay inside it:
  - Reuse geometries and materials. Use `InstancedMesh` for repeated props.
  - Merge static track geometry. Dispose geometries, materials, textures and listeners on teardown.
  - No allocations inside per-frame code: reuse temp `Vector3`/`Quaternion` objects.
  - Cap `renderer.setPixelRatio` by quality preset.
- UI (menus, lobby, HUD in chase cam, overlays) is DOM + CSS on top of the canvas,
  not Three.js text. Must be readable at 1366x768.
- Input: `KeyboardEvent.code`, never `key`. Mouse look only through Pointer Lock in cockpit cam.
- Every screen and camera must be reachable by a `?scenario=` URL for `/shots`, and
  `window.__game` must expose `ready` and `stats()` (see `docs/TESTING.md`).
- Only local assets. Fonts from `@fontsource/*`, images from `assets/`. No CDN URLs.
- Car and prop models are built procedurally from data (`config/cars.json`) by the
  car kit / prop kit builders. No hand-placed magic numbers in render code: proportions
  come from the data, look rules from `docs/ART_STYLE.md`.
