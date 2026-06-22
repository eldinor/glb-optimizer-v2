# babylonpress-ktx2-encoder

KTX2 (`.ktx2`) encoding utilities for browser and Node.js applications, built on Basis Universal WASM. Supports UASTC and ETC1S compression.

Part of [BabylonPress](https://babylonpress.org/).

This package is maintained in the [`packages/babylonpress-ktx2-encoder`](https://github.com/eldinor/glb-optimizer-v2/tree/master/packages/babylonpress-ktx2-encoder) directory of the `eldinor/glb-optimizer-v2` repository and builds on the original work by Hu Song.

Created by [BabylonPress](https://babylonpress.org/).

## Install

```sh
npm install babylonpress-ktx2-encoder
```

## What It Supports

- browser KTX2 encoding
- browser worker KTX2 encoding
- browser worker pool KTX2 encoding for batch jobs
- Node.js KTX2 encoding
- glTF-Transform integration

## Browser

### Direct encode

```ts
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";

const png = new Uint8Array(await fetch("/texture.png").then((res) => res.arrayBuffer()));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
});
```

By default, the browser build resolves its bundled Basis JS and WASM assets automatically.

### Single worker

Use `worker: true` when you want background encoding without changing the main API:

```ts
const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  worker: true,
});
```

This is mainly about keeping the UI responsive. It usually does not make a single encode much faster.

### Worker pool

Use a pool for batch conversion:

```ts
import { createKTX2WorkerPool, encodeToKTX2 } from "babylonpress-ktx2-encoder";

const pool = createKTX2WorkerPool({ size: 4 });

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  worker: pool,
});

const results = await pool.encodeMany([
  {
    imageBuffer: textureA,
    options: { isUASTC: true, generateMipmap: true },
  },
  {
    imageBuffer: textureB,
    options: { isUASTC: true, generateMipmap: true },
  },
]);

pool.terminate();
```

Pool size can be:

- omitted, which defaults to `2`
- a number like `1`, `2`, `4`
- `"auto"`, which uses a conservative `hardwareConcurrency` heuristic

```ts
const pool = createKTX2WorkerPool({ size: "auto" });
```

### Browser notes

- `worker: true` uses a shared default worker client
- worker encoding does not support a custom `imageDecoder` function
- `wasmUrl` and `jsUrl` can still be overridden when custom hosting is needed

## Node.js

Node requires an `imageDecoder` for LDR inputs.

```ts
import fs from "node:fs/promises";
import sharp from "sharp";
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";

async function imageDecoder(buffer: Uint8Array) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const rawBuffer = await image.ensureAlpha().raw().toBuffer();

  return {
    width: metadata.width!,
    height: metadata.height!,
    data: new Uint8Array(rawBuffer),
  };
}

const png = new Uint8Array(await fs.readFile("./texture.png"));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  imageDecoder,
});
```

## glTF-Transform

```ts
import { ktx2 } from "babylonpress-ktx2-encoder/gltf-transform";

await document.transform(
  ktx2({
    isUASTC: true,
    generateMipmap: true,
    // Required in Node.js for LDR inputs; use the decoder from the Node.js example above.
    imageDecoder,
  }),
);
```

In browsers, omit `imageDecoder` to use the built-in decoder.

### Runnable Node GLB example

The repository includes a complete example that reads a GLB, converts its PNG/JPEG/WebP textures to KTX2, and writes a new GLB:

```sh
npm run example:node-ktx2 -- input.glb output.glb
```

See [`examples/optimize-glb.mjs`](./examples/optimize-glb.mjs).

## Benchmark

A local benchmark page is included for comparing:

- main-thread encode
- single worker encode
- worker pool batch encode

Run it with:

```sh
npm run benchmark
```

The page is served from `/benchmark/`.

## API

See [API.md](./API.md) for a focused API reference.

## Development

### Main optimizer app

Run this from the repository root:

```sh
npm run dev
```

This starts the React/Vite optimizer app at `http://localhost:1340`. The app imports this package through its built `dist/web` entry, so rebuild the encoder after changing files under `src/`:

```sh
npm run build --workspace babylonpress-ktx2-encoder
```

### Encoder development server

Run this from `packages/babylonpress-ktx2-encoder`:

```sh
npm run dev
```

This starts a separate Vite server, normally at `http://localhost:5173`. Open `/` for the image conversion demo, `/benchmark/` for the benchmark, or `/benchmark/compare.html` for the comparison page. These pages import the encoder source directly, so source changes are reflected without rebuilding `dist`.

Use `npm run demo` to open the image conversion demo automatically, or `npm run benchmark` to open `/benchmark/`.

### Package smoke test

To build the package and run a small consumer-style test from `dist`:

```sh
npm run test:package
```

The smoke test imports `babylonpress-ktx2-encoder` and `babylonpress-ktx2-encoder/gltf-transform` by package name, performs a real Node encode, and validates the KTX2 file signature. It has no image-decoder dependency.

### Build and test commands

```sh
npm run build
npm test
npm run test:web
npm run test:gltf
npm run test:gltf:web
npm run test:coverage
```
