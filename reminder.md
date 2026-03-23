# Newsandbox Reminder

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

- Add any missing optimizer summary details such as original size, optimized size, and other useful output stats

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
- Possible later additions:
  - reflector mode
  - 3dcommerce mode

## Nice To Have

- Revisit the Babylon-style render suspension implementation if we want to push further toward full auto-suspend behavior
- Revisit inspector loading strategy to reduce initial bundle size
- Add material variants support for `KHR_materials_variants` if we decide it should come back into near-term scope
- Add camera picker UI and camera switching if we decide they are needed again
- Restore custom environment file loading for dropped `.env`, `.hdr`, and `.dds` if we decide it is needed again
- Verify `EXT_mesh_gpu_instancing` behavior
