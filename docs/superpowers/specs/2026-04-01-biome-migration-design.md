# Replace oxlint + Prettier with Biome

## Summary

Migrate from oxlint (linter) + Prettier (formatter) to Biome, which provides both linting and formatting in a single tool. Extend linting coverage from `apps/web` only to all workspaces.

## Current State

- **Linter:** oxlint v1.55, configured only in `apps/web/oxlint.config.mjs` via `@standard-config/oxlint`
- **Formatter:** Prettier v3.5 with default settings (empty `.prettierrc`)
- **Git hooks:** Lefthook pre-commit runs prettier + oxlint in parallel on staged files
- **Coverage gap:** Only `apps/web` has lint scripts; desktop, core, docs, and mobile have none or placeholders

## Design

### Biome Configuration

A single `biome.json` at the repo root covers all workspaces.

**Formatter:**

- Biome defaults: tabs, double quotes, line width 80

**Linter:**

- Enable recommended rule set
- Enable import sorting (organize imports)
- Note: Biome's `noRestrictedImports` only blocks entire modules, not specific imports from a module. The oxlint rule restricting `import React from 'react'` (default import) while allowing named imports cannot be replicated exactly. This rule is dropped — the automatic JSX runtime (React 17+) makes the default import unnecessary, so enforcement is no longer needed.

**Test file overrides:**

- Relax TypeScript safety rules (`noUnsafeDeclarationMerging`, etc.) in `**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}`, matching the current oxlint relaxations

**Ignore patterns:**

- `node_modules`, `.output`, `dist`, `src/routeTree.gen.ts`

### Files to Remove

| File                         | Reason                           |
| ---------------------------- | -------------------------------- |
| `apps/web/oxlint.config.mjs` | Replaced by root `biome.json`    |
| `.prettierrc`                | Replaced by Biome formatter      |
| `.prettierignore`            | Merged into `biome.json` ignores |
| `apps/web/.prettierignore`   | Merged into `biome.json` ignores |

### Dependencies

**Remove:**

- `oxlint` (root + apps/web)
- `prettier` (root + apps/web)
- `@standard-config/oxlint` (apps/web)
- `oxlint-tsgolint` (apps/web)

**Add:**

- `@biomejs/biome` at root only

### Script Updates

**`apps/web/package.json`:**

- `lint` → `biome check .`
- `lint:fix` → `biome check --write .`

**All other workspaces** (`apps/desktop`, `apps/docs`, `apps/mobile`, `packages/core`):

- Add `lint` → `biome check .`
- Add `lint:fix` → `biome check --write .`
- Replaces placeholder echo scripts in docs and mobile

**Root `package.json`:**

- `lint` and `lint:fix` unchanged — still delegate to `turbo lint` / `turbo lint:fix`

### Lefthook Updates

Replace the two separate pre-commit commands (prettier + oxlint) with a single Biome command:

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{js,jsx,ts,tsx,css,html,json,md,yaml,yml}"
      run: bunx biome check --write {staged_files}
      stage_fixed: true
```

Commitlint stays as-is.

### Formatting Migration

Switching to Biome defaults (tabs instead of spaces) requires a one-time reformat of the entire codebase:

- Run `biome check --write .` from the root
- Commit separately as `style: reformat codebase with biome` to keep the config change and the formatting diff reviewable

### CLAUDE.md Update

Update the project `CLAUDE.md` to reflect:

- Linting tool is now Biome (not oxlint + prettier)
- Config location is root `biome.json`
- `lint` / `lint:fix` commands use Biome

## Out of Scope

- CI/CD lint checks (GitHub Actions)
- VS Code / IDE configuration
- Changes to commitlint or lefthook commit-msg hook
