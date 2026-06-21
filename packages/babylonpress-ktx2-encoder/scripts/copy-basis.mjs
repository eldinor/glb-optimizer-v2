import { cp, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await cp("src/basis", "dist/basis", { recursive: true });
await cp("examples/package-smoke.mjs", "dist/package-smoke.mjs");
