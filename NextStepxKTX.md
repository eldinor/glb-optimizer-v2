# Next Steps for KTX Package

## Packaging and publish

1. Publish from package source with a reproducible build, instead of relying on copied `dist` contents.
2. Keep browser and Node Basis loaders cleanly separated so browser bundles never include Node-only code paths.
3. Decide whether `@gltf-transform/core` and `@gltf-transform/extensions` should be `dependencies` or `peerDependencies`, then document that choice clearly.
4. Ensure `API.md`, README docs, wasm assets, and export targets are always included in published output.

## Developer experience

1. Make the browser and Node root exports more symmetrical, or document the differences prominently.
2. Expand package docs with recommended usage for:
   - direct browser encode
   - worker encode
   - worker pool encode
   - Node encode
3. Add a first-class fallback mode for browser worker encoding so consumers do not need to implement retry logic in app code.
4. Improve runtime errors around:
   - wasm load failures
   - worker startup failures
   - unsupported browser APIs
   - image decode failures

## Browser robustness

1. Harden worker-side image decoding.
   Current worker path depends on `OffscreenCanvas`, `webgl2`, and `createImageBitmap`, which is fragile across environments.
2. Add capability detection before worker use and fall back automatically when unsupported.
3. Consider distinct decoding strategies for main-thread vs worker execution instead of assuming both environments support the same browser primitives.

## Testing

1. Make package tests self-contained so they do not depend on root-repo paths or app-specific layout.
2. Add regression coverage for Vite/browser-consumption issues, especially around top-level-await and browser bundling.
3. Add tests for worker failure fallback behavior.
4. Add publish validation checks:
   - `API.md` present
   - wasm present
   - export targets resolvable
   - browser/node entry points import correctly

## Workspace structure

1. Treat `packages/babylonpress-ktx2-encoder` as a more standalone workspace package with its own build/test flow.
2. Add a root script that builds the encoder package before app build if package source changes become frequent.
3. Keep package-local generated files and dependencies out of git.

## Product and API ideas

1. Add a glTF-Transform path that can use the worker pool directly for batch texture conversion.
2. Improve progress reporting so it can include texture names/counts, not only lifecycle states.
3. Add higher-level encoder presets such as:
   - `uastc-color`
   - `uastc-normal`
   - `etc1s-color`
   - `etc1s-mask`
   This would reduce consumer-side option juggling.
