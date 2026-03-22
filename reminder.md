# Newsandbox Migration Reminder

This file tracks what is still missing before `packages/tools/newsandbox` reaches feature parity with the original Sandbox scope we decided to keep.

Already done:
- Vite app scaffold inside `packages/tools/newsandbox`
- external Babylon npm alias imports for monorepo development
- single-canvas split compare view
- drag and drop loading
- open file flow
- optimize `.glb`
- optimize `.gltf`
- download optimized `.glb`
- screenshot compare with overlay on optimized half
- React settings UI
- reusable non-KTX optimizer modules
- reusable KTX modules
- KTX-related optimizer options
- fullscreen canvas layout close to original app
- `.gltf` sidecar-file flow with incremental missing-file upload
- `R` reload behavior for uploaded assets
- original and optimized size display in the top bar
- direct Draco read/write support through Babylon and glTF-Transform
- generic source/output compression detection (`Draco`, `Meshopt`, `No Compression`)
- unified reusable asset-features detection module
- reusable animation controls with play/pause, scrubber, and group selection
- texture-only input flow with generated plane preview
- texture-only export choice between optimized image output and optimized GLB plane output
- texture-only settings panel cleanup so scene-only controls are hidden when not relevant

Still to finish:

## Core Asset Flow
- Smoke test texture-only flows more thoroughly:
  - `keep`
  - resize-only
  - `png` / `webp`
  - `ktx2`
  - image export
  - GLB plane export

## Optimization Behavior
- Verify parity for `EXT_mesh_gpu_instancing` export behavior
- Verify parity for `meshopt`, `quantize`, `reorder`, `simplify`, and `sparse` settings against the original app
- Add any missing optimizer summary details such as original size, optimized size, and other useful output stats

## UI Parity
- Bring footer control order and wording closer to the original app where useful
- Decide whether to restore a dedicated top secondary info banner behavior closer to `topInfo` and `topInfo2`
- Review help overlay content and align it more closely with original app help text
- Review settings grouping and labels for closer parity with the original app

## Diagnostics And Messaging
- Restore validation or loader warning messaging where helpful
- Add clearer error and status messaging around optimization failures
- Add source-versus-optimized stats in the top bar if desired

## URL And Runtime Behavior
- Restore supported URL params from the original app:
  - `assetUrl`
  - `autoRotate`
  - `cameraPosition`
  - `kiosk`
  - `environment`
  - `skybox`
  - `clearColor`
  - `camera`
- Keep intentionally dropped features out for now:
  - legacy global `BABYLON.Sandbox.Show` bootstrap
  - OBJ support
  - `.babylon` support
- Possible later additions:
  - reflector mode
  - 3dcommerce mode

## Cleanup Before Repo Split
- Replace temporary Babylon alias imports with final clean imports like `@babylonjs/core`
- Remove monorepo-specific assumptions
- Revisit bundle size and add chunking or lazy loading where useful
- Review which reusable modules should live in shared packages vs stay app-local

## Nice To Have
- Add a stronger migration checklist for "must-have before repo split" vs "can wait until after repo split"
- Add small regression checks for optimizer flow and compare flow
- Revisit inspector loading strategy to reduce initial bundle size
- Add material variants support for `KHR_materials_variants` if we decide it should come back into near-term scope
- Add camera picker UI and camera switching if we decide they are needed again
- Restore custom environment file loading for dropped `.env`, `.hdr`, and `.dds` if we decide it is needed again
