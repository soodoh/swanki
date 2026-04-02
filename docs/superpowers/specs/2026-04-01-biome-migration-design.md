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

A single `biome.json` at the repo root, using the same config as the `diloreto-website` project:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.10/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true,
    "defaultBranch": "main"
  },
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "**",
      "!!**/node_modules",
      "!!**/.output",
      "!!**/dist",
      "!!**/src/routeTree.gen.ts"
    ]
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "formatter": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "react": {
                "importNames": ["default"],
                "message": "Use named imports from 'react' instead."
              }
            }
          }
        }
      }
    }
  }
}
```

Key features:

- **VCS integration:** Uses `.gitignore` for file exclusions
- **Formatter:** Biome defaults (tabs, double quotes, line width 80)
- **Linter:** Recommended rules + `noRestrictedImports` to block `import React from 'react'` (carries over the oxlint rule)
- **Import sorting:** Organize imports via assist actions
- **CSS:** Tailwind directive support enabled
- **Ignore patterns:** `node_modules`, `.output`, `dist`, `src/routeTree.gen.ts`

Note: The current oxlint test file overrides (relaxed TS safety rules) are dropped — Biome's recommended rules don't include the same overly strict TS checks, so overrides are unnecessary.

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
