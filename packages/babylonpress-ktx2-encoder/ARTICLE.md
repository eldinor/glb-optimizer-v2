# From `ktx2-encoder` to `babylonpress-ktx2-encoder`

`babylonpress-ktx2-encoder` is a browser and Node.js library for converting images to GPU-friendly KTX2 textures with Basis Universal. It is maintained by [BabylonPress](https://babylonpress.org/) as part of the [GLB Optimizer](https://github.com/eldinor/glb-optimizer-v2/tree/master/packages/babylonpress-ktx2-encoder), where texture compression is one of the most important steps in reducing the download size and GPU cost of 3D assets.

The package builds on Hu Song's original [`gz65555/ktx2-encoder`](https://github.com/gz65555/ktx2-encoder). That project established the essential foundation: UASTC and ETC1S encoding, browser and Node.js support, 2D textures and cubemaps, and glTF-Transform integration. The BabylonPress version keeps that foundation while focusing on speed, responsiveness, reliability, and production workflows.

## What has improved

### Faster batch encoding without blocking the UI

Performance is one of the biggest improvements. The browser encoder can now run directly, in a dedicated worker, or through a reusable worker pool. For GLBs containing many textures, the pool processes several encodes concurrently and can be much faster than sequential main-thread batch encoding.

Worker and pool modes move the expensive Basis compression work off the browser's UI thread. The application remains responsive while textures are encoded instead of freezing during a long conversion. A single worker is primarily a responsiveness improvement; the largest throughput gains come from using a tuned worker pool for batch jobs. Encoding requests also support cancellation and progress lifecycle events.

Basis JavaScript and WASM assets are resolved automatically in the browser build. The Node.js loader reads the packaged WASM binary directly, avoiding fragile relative-URL loading. Input validation reports invalid quality ranges, unsupported option combinations, malformed cubemaps, and missing Node decoders before expensive encoding begins. Output allocation can grow when necessary instead of relying on a single fixed-size buffer.

The glTF-Transform integration has also been hardened. Converted external textures receive `.ktx2` URIs, slot and name filters behave consistently, conversion failures reject the transform instead of being silently hidden, and `KHR_texture_basisu` is marked as required when textures are converted.

Finally, the package includes Node and browser test suites, real Chrome smoke tests, benchmark pages, an interactive image-conversion demo, a runnable GLB example, and a consumer-style package smoke test. These additions make the encoder easier to validate, integrate, and publish with confidence.

The result is the extremely useful Basis Universal encoder, adapted for fast responsive web applications, repeatable Node.js pipelines, and practical GLB/GLTF optimization.

Created by [BabylonPress](https://babylonpress.org/).
