# Newsandbox Repo Move Checklist

This checklist is for moving `packages/tools/newsandbox` out of the Babylon.js monorepo into a clean standalone repository.

## Copy Into The New Repo
- `src/`
- `index.html`
- `package.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `vite.config.ts`
- `README.md`
- `reminder.md`
- this file

## Do Not Copy
- `node_modules/`
- `dist/`
- `*.tsbuildinfo`
- generated `vite.config.js`
- generated `vite.config.d.ts`

## First Cleanup In The New Repo

### 1. Replace Babylon Alias Packages In `package.json`
Replace:
- `@newsandbox/babylonjs-core` -> `@babylonjs/core`
- `@newsandbox/babylonjs-loaders` -> `@babylonjs/loaders`
- `@newsandbox/babylonjs-inspector` -> `@babylonjs/inspector`

Also choose the final package name instead of `@tools/newsandbox`.

### 2. Replace Source Imports
Search for `@newsandbox/` and replace imports with final `@babylonjs/*` imports.

Known files:
- `src/custom.d.ts`
- `src/components/ViewerCanvas.tsx`
- `src/features/draco/loadDracoDecoderModule.ts`
- `src/features/screenshotCompare/captureSceneComparison.ts`

### 3. Simplify `vite.config.ts`
Remove the Babylon alias mapping block under `resolve.alias`.

Keep:
- React plugin
- port config if still wanted

### 4. Install Fresh Dependencies
Run:
```bash
npm install
```

### 5. Verify
Run:
```bash
npm run typecheck
npm run build
```

## Smoke Test In The New Repo
- load `.glb`
- load `.gltf` with sidecar files
- optimize source asset
- compare screenshots
- test Draco on/off
- test animation controls
- test `R` reload

## Nice Cleanup After Extraction
- lazy-load inspector more aggressively if needed
- reduce bundle size
- delete unused files if they are truly no longer part of the app
- review which reusable modules should stay app-local vs move into shared packages later

## What To Tell Codex In The New Repo
Use a prompt like this:

```md
Continue Newsandbox migration in this standalone repo.

Context:
- This repo was extracted from `packages/tools/newsandbox` in Babylon.js.
- Please read `reminder.md` and `repo-move-checklist.md` first.
- The app should use final npm imports like `@babylonjs/core`.
- Keep scope to this repo only.

First tasks:
- verify extraction cleanup
- fix any broken imports or config
- run typecheck/build
- then continue from `reminder.md`
```

If the extraction is only partially cleaned up, use:

```md
Continue Newsandbox extraction cleanup in this standalone repo.

Please:
- read `repo-move-checklist.md`
- replace any remaining monorepo-specific Babylon alias imports
- verify `vite.config.ts`
- run typecheck/build
- then continue with `reminder.md`
```

## Best Resume Prompt After Extraction Is Stable
```md
Continue Newsandbox work from `reminder.md`.
Read `reminder.md` and summarize the next best task before editing.
```
