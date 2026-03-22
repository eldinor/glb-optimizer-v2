# New Sandbox Extraction Docs

This folder is the planning workspace for remaking `packages/tools/sandbox` as a separate app in a separate repo.

It now also contains the first standalone app scaffold.

Current direction:

- Source app: `packages/tools/sandbox`
- New app name: `newsandbox` for now
- Bundler: Vite
- Explicitly dropped from the remake:
  - reflector mode
  - 3dcommerce mode
  - legacy global `BABYLON.Sandbox.Show` bootstrap

This doc set is organized by stage so we can move from understanding to extraction without losing behavior we still want.

Suggested reading order:

1. [01-scope.md](/c:/Users/Fiolent23/newrepos/new-bab-fork/Babylon.js/packages/tools/newsandbox/01-scope.md)
2. [02-dependency-audit.md](/c:/Users/Fiolent23/newrepos/new-bab-fork/Babylon.js/packages/tools/newsandbox/02-dependency-audit.md)
3. [03-target-architecture.md](/c:/Users/Fiolent23/newrepos/new-bab-fork/Babylon.js/packages/tools/newsandbox/03-target-architecture.md)
4. [04-migration-stages.md](/c:/Users/Fiolent23/newrepos/new-bab-fork/Babylon.js/packages/tools/newsandbox/04-migration-stages.md)
5. [05-open-questions.md](/c:/Users/Fiolent23/newrepos/new-bab-fork/Babylon.js/packages/tools/newsandbox/05-open-questions.md)

Expected outcome:

- a standalone Vite app
- normal React bootstrap instead of Babylon global bootstrap
- published npm package dependencies instead of Babylon monorepo-internal imports
- a cleaner split between viewer UI, optimization state, and GLB pipeline

Current scaffold files:

- `package.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/app/*`
- `src/components/*`

Quick start once dependencies are installed:

```bash
npm install
npm run dev -w @tools/newsandbox

Note for monorepo development:

- `newsandbox` currently uses temporary Babylon npm aliases so it can avoid colliding with this repo's local `@babylonjs/*` workspaces.
- When the app moves to its own repository, those aliases can be switched back to clean final imports like `@babylonjs/core`.
```
