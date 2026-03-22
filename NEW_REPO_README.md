# New Repo First Steps

This file is a short handoff guide for the standalone `newsandbox` repository after extracting it from the Babylon.js monorepo.

## 1. Open The New Repo
Unzip the exported app into its own clean repository root.

## 2. Install Dependencies
Run:

```bash
npm install
```

## 3. Replace Temporary Babylon Alias Packages
This extracted app still uses temporary monorepo-safe Babylon aliases like `@newsandbox/babylonjs-core`.

In the new repo:
- replace those dependencies in `package.json` with final npm packages like `@babylonjs/core`
- replace source imports from `@newsandbox/*` to `@babylonjs/*`
- remove the Babylon alias mapping block from `vite.config.ts`

See:
- `repo-move-checklist.md`

## 4. Verify
Run:

```bash
npm run typecheck
npm run build
```

Then smoke test:
- load `.glb`
- load `.gltf` with sidecar files
- optimize
- compare screenshots
- test Draco on/off
- test animation controls
- test `R` reload

## 5. Best Prompt To Continue With Codex
Use this prompt in the new repo:

```md
Continue Newsandbox migration in this standalone repo.

Context:
- This repo was extracted from `packages/tools/newsandbox` in Babylon.js.
- Please read `reminder.md`, `repo-move-checklist.md`, and `NEW_REPO_README.md` first.
- The app should use final npm imports like `@babylonjs/core`.
- Keep scope to this repo only.

First tasks:
- verify extraction cleanup
- fix any broken imports or config
- run typecheck/build
- then continue from `reminder.md`
```

## 6. Short Resume Prompt After Cleanup
Once the new repo is stable, this shorter prompt is enough:

```md
Continue Newsandbox work from `reminder.md`.
Read `reminder.md` and summarize the next best task before editing.
```
