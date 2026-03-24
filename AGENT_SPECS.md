# Agent Specs

This file defines suggested agent roles for working on `glb-optimizer-v2`.

## Purpose

Use these specs when splitting work across agents or when handing the repo to a new coding assistant. The goal is to keep changes scoped, reduce overlap, and make review easier.

## Shared Rules

- Read `reminder.md` before making product-scope decisions.
- Preserve existing Babylon.js viewer behavior unless the task explicitly changes it.
- Prefer small, isolated edits.
- Do not move controls between panels without updating related CSS and summary UI.
- Keep dark-panel UI readable: light text, dark inputs, visible active/inactive states.
- When editing optimization settings, check both:
  - `src/components/SettingsPanel.tsx`
  - `src/app/App.tsx`
- When editing summary/header UI, check both:
  - `src/app/App.tsx`
  - `src/app/App.css`

## Agent 1: UI Layout Agent

### Scope

- Header layout
- Footer layout
- Overlay layout
- Panel spacing
- Responsive CSS

### Owns

- `src/app/App.tsx`
- `src/app/App.css`
- component CSS files related to layout

### Responsibilities

- Keep top header compact and readable.
- Avoid accidental header-height regressions.
- Use shared CSS variables for measured header/footer offsets when possible.
- Preserve mobile behavior.

### Watch Outs

- Small spacing changes can break the measured header/footer layout.
- Do not reintroduce hard-coded offsets when a measured variable already exists.

## Agent 2: Settings UX Agent

### Scope

- Settings overlay structure
- User Settings overlay structure
- Tabs
- Control grouping
- Dark-theme control styling

### Owns

- `src/components/SettingsPanel.tsx`
- `src/components/SettingsPanel.css`
- User Settings section inside `src/app/App.tsx`
- related styles in `src/app/App.css`

### Responsibilities

- Keep settings grouped logically:
  - `Basic`
  - `Mesh`
  - `Texture`
- Ensure Fluent inputs/selects/switches remain readable on dark surfaces.
- Keep User Settings separate from optimization settings unless explicitly requested.

### Watch Outs

- Fluent wrapper colors do not always affect inner `input` and `select` elements.
- Switch labels may need explicit color overrides.

## Agent 3: Babylon Viewer Agent

### Scope

- Babylon engine lifecycle
- Scene loading
- Render loop behavior
- Suspend/resume rendering
- Interaction-driven rerendering

### Owns

- `src/components/ViewerCanvas.tsx`
- Babylon-specific helpers it uses

### Responsibilities

- Keep render-loop control stable.
- Treat `suspendRendering()` as a reusable pattern but not a blind copy-paste utility.
- Preserve drag/drop, compare mode, animation controls, and reload behavior.

### Watch Outs

- Rendering suspension is coupled to:
  - scene readiness
  - mutation tracking
  - idle timeout
- Reuse the pattern carefully in other Babylon apps.

## Agent 4: Optimizer Agent

### Scope

- glTF optimization behavior
- compression behavior
- KTX2 settings
- output naming
- texture export flow

### Owns

- `src/app/optimizer.ts`
- `src/app/model.ts`
- `src/app/defaultSettings.ts`
- tests around optimization behavior

### Responsibilities

- Keep scene and texture flows both working.
- Verify that UI settings match actual optimization behavior.
- Preserve source/output compression reporting.

### Watch Outs

- Some settings are scene-only.
- Some settings are texture-only.
- Header summaries and chosen-settings summaries should stay in sync with real optimizer behavior.

## Agent 5: Diagnostics And QA Agent

### Scope

- smoke checks
- regression review
- status/warning messaging
- UI verification after layout changes

### Owns

- lightweight verification tasks
- tests when added
- messaging polish in app-level UI

### Responsibilities

- Check:
  - `.glb` flow
  - `.gltf` with sidecars
  - texture-only flow
  - compare flow
  - compression toggles
  - tab visibility
- Flag visual regressions early.

### Watch Outs

- `vite.config.ts` currently has a typing issue that can block full build verification.
- Prefer targeted checks when unrelated config issues exist.

## Suggested Task Routing

- Header/panel alignment request:
  - UI Layout Agent
- Settings tabs or dark-theme controls:
  - Settings UX Agent
- Render suspend/resume logic:
  - Babylon Viewer Agent
- Compression/output behavior:
  - Optimizer Agent
- “Please review this change”:
  - Diagnostics And QA Agent

## Definition Of Done

A task is complete when:

- the requested UI/behavior change is implemented
- closely related styling is updated too
- no duplicate controls are left behind
- any moved setting still affects the real app state
- likely regressions were checked in nearby UI
