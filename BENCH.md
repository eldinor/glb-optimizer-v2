# Benchmark Notes

Since `packages/babylonpress-ktx2-encoder` already includes benchmark tooling, the best path is to extend that benchmark instead of building a separate app-level benchmark first.

## Recommended order

1. Benchmark encoder behavior inside the package.
2. Compare old and new packages there.
3. Add app-level GLB end-to-end timing only if needed afterward.

## Why this is better

- It isolates encoder performance from app overhead.
- It compares old vs new more directly.
- It avoids mixing in unrelated costs such as:
  - GLB parsing
  - transform pipeline time
  - preview generation
  - download packaging

## What to compare

Add a comparison mode in the package benchmark for:

- old `ktx2-encoder`
- new `babylonpress-ktx2-encoder` main-thread
- new `babylonpress-ktx2-encoder` worker
- new `babylonpress-ktx2-encoder` worker-pool

## What to measure

- average encode time
- median encode time
- total batch time
- per-texture throughput
- output size
- failure count / fallback count

## Benchmark rules

- Use the same source textures for all runs.
- Use the same encoder settings for all runs.
- Run multiple iterations, not a single pass.
- Ignore or separate cold-start cost if wasm/module init skews results.
- Use package-level benchmark results first, then validate in the app if needed.

## Practical conclusion

First answer:
"Is the new encoder package faster or better than the old one?"

Only then answer:
"Does full GLB optimization improve in the app?"
