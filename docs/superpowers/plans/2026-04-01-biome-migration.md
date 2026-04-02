# Biome Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace oxlint + Prettier with Biome for linting and formatting across all workspaces.

**Architecture:** Single `biome.json` at the repo root covers all workspaces. Biome handles both linting and formatting, replacing two tools with one. Lefthook pre-commit hook updated to use Biome.

**Tech Stack:** Biome v2, Bun, Turborepo, Lefthook

---

## File Structure

| Action | File                         | Purpose                                          |
| ------ | ---------------------------- | ------------------------------------------------ |
| Create | `biome.json`                 | Root Biome config (linter + formatter)           |
| Delete | `apps/web/oxlint.config.mjs` | Replaced by `biome.json`                         |
| Delete | `.prettierrc`                | Replaced by Biome formatter                      |
| Delete | `.prettierignore`            | Merged into `biome.json` ignores                 |
| Delete | `apps/web/.prettierignore`   | Merged into `biome.json` ignores                 |
| Modify | `package.json`               | Remove oxlint/prettier deps, add @biomejs/biome  |
| Modify | `apps/web/package.json`      | Remove oxlint/prettier deps, update lint scripts |
| Modify | `apps/desktop/package.json`  | Add lint scripts                                 |
| Modify | `apps/docs/package.json`     | Replace placeholder lint scripts                 |
| Modify | `apps/mobile/package.json`   | Replace placeholder lint scripts                 |
| Modify | `packages/core/package.json` | Add lint scripts                                 |
| Modify | `lefthook.yml`               | Replace prettier+oxlint with biome command       |
| Modify | `CLAUDE.md`                  | Update linting references                        |

---

### Task 1: Install Biome and remove old dependencies

**Files:**

- Modify: `package.json`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add @biomejs/biome to root devDependencies**

```bash
cd /Users/pauldiloreto/Projects/swanki && bun add -d @biomejs/biome
```

- [ ] **Step 2: Remove oxlint and prettier from root devDependencies**

```bash
cd /Users/pauldiloreto/Projects/swanki && bun remove oxlint prettier
```

- [ ] **Step 3: Remove oxlint, prettier, and related packages from apps/web devDependencies**

```bash
cd /Users/pauldiloreto/Projects/swanki/apps/web && bun remove oxlint prettier @standard-config/oxlint oxlint-tsgolint
```

- [ ] **Step 4: Verify package.json changes**

Run: `cd /Users/pauldiloreto/Projects/swanki && grep -c "oxlint\|prettier" package.json apps/web/package.json`

Expected: Both files show 0 matches (no remaining oxlint/prettier references in dependencies).

Note: The `lint` and `lint:fix` script values in `apps/web/package.json` still reference oxlint/prettier at this point — that's expected and will be fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/web/package.json bun.lock
git commit -m "chore: add biome and remove oxlint and prettier dependencies"
```

---

### Task 2: Create biome.json and remove old config files

**Files:**

- Create: `biome.json`
- Delete: `apps/web/oxlint.config.mjs`
- Delete: `.prettierrc`
- Delete: `.prettierignore`
- Delete: `apps/web/.prettierignore`

- [ ] **Step 1: Create `biome.json` at the repo root**

Write this file to `/Users/pauldiloreto/Projects/swanki/biome.json`:

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

- [ ] **Step 2: Delete old config files**

```bash
cd /Users/pauldiloreto/Projects/swanki
rm apps/web/oxlint.config.mjs .prettierrc .prettierignore apps/web/.prettierignore
```

- [ ] **Step 3: Verify biome.json is valid**

```bash
cd /Users/pauldiloreto/Projects/swanki && bunx biome check --max-diagnostics=0 biome.json
```

Expected: No errors about invalid config.

- [ ] **Step 4: Commit**

```bash
git add biome.json
git add -u apps/web/oxlint.config.mjs .prettierrc .prettierignore apps/web/.prettierignore
git commit -m "chore: add biome.json and remove oxlint and prettier configs"
```

---

### Task 3: Update lint scripts in all workspaces

**Files:**

- Modify: `apps/web/package.json` (lines 10-11, lint/lint:fix scripts)
- Modify: `apps/desktop/package.json` (add lint/lint:fix scripts)
- Modify: `apps/docs/package.json` (lines 9-10, replace placeholder lint scripts)
- Modify: `apps/mobile/package.json` (lines 10-11, replace placeholder lint scripts)
- Modify: `packages/core/package.json` (add lint/lint:fix scripts)

- [ ] **Step 1: Update `apps/web/package.json` lint scripts**

Replace:

```json
"lint": "bun x oxlint -c oxlint.config.mjs . && prettier --check .",
"lint:fix": "bun x oxlint -c oxlint.config.mjs --fix . && prettier --write .",
```

With:

```json
"lint": "biome check .",
"lint:fix": "biome check --write .",
```

- [ ] **Step 2: Add lint scripts to `apps/desktop/package.json`**

Add these scripts (after the existing `test:e2e:ui` script):

```json
"lint": "biome check .",
"lint:fix": "biome check --write ."
```

- [ ] **Step 3: Replace placeholder lint scripts in `apps/docs/package.json`**

Replace:

```json
"lint": "echo 'docs lint placeholder'",
"lint:fix": "echo 'docs lint fix placeholder'",
```

With:

```json
"lint": "biome check .",
"lint:fix": "biome check --write .",
```

- [ ] **Step 4: Replace placeholder lint scripts in `apps/mobile/package.json`**

Replace:

```json
"lint": "echo 'mobile lint placeholder'",
"lint:fix": "echo 'mobile lint fix placeholder'",
```

With:

```json
"lint": "biome check .",
"lint:fix": "biome check --write .",
```

- [ ] **Step 5: Add lint scripts to `packages/core/package.json`**

Add a `scripts` section to `packages/core/package.json`:

```json
"scripts": {
  "lint": "biome check .",
  "lint:fix": "biome check --write ."
},
```

Add it after the `"private": true,` line (line 4).

- [ ] **Step 6: Verify turbo lint runs across all workspaces**

```bash
cd /Users/pauldiloreto/Projects/swanki && bun run lint 2>&1 | tail -20
```

Expected: Turbo runs lint in all 5 workspaces (web, desktop, docs, mobile, core). There will likely be lint errors at this point — that's fine, we just need to confirm all workspaces are picked up.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/desktop/package.json apps/docs/package.json apps/mobile/package.json packages/core/package.json
git commit -m "chore: update lint scripts to use biome in all workspaces"
```

---

### Task 4: Update lefthook pre-commit hook

**Files:**

- Modify: `lefthook.yml`

- [ ] **Step 1: Replace prettier and oxlint commands with biome**

Replace the entire `pre-commit` section in `lefthook.yml`:

Old:

```yaml
pre-commit:
  parallel: true
  commands:
    prettier:
      glob: "*.{js,jsx,ts,tsx,css,html,json,md,mdx,yaml,yml}"
      run: bunx prettier --write {staged_files}
      stage_fixed: true
    oxlint:
      glob: "*.{js,jsx,ts,tsx}"
      run: bunx oxlint --fix -c apps/web/oxlint.config.mjs {staged_files}
      stage_fixed: true
```

New:

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{js,jsx,ts,tsx,css,json}"
      run: bunx biome check --write {staged_files}
      stage_fixed: true
```

Note: The glob drops `html`, `md`, `mdx`, `yaml`, `yml` because Biome does not support formatting those file types. The `commit-msg` section stays unchanged.

- [ ] **Step 2: Commit**

```bash
git add lefthook.yml
git commit -m "chore: update lefthook to use biome instead of prettier and oxlint"
```

---

### Task 5: Reformat the codebase

- [ ] **Step 1: Run biome on the entire codebase with auto-fix**

```bash
cd /Users/pauldiloreto/Projects/swanki && bunx biome check --write .
```

This will reformat all files (tabs instead of spaces, double quotes) and fix any auto-fixable lint issues. Review the output for any errors that need manual attention.

- [ ] **Step 2: Fix any lint errors that couldn't be auto-fixed**

Review the output from Step 1. If there are lint errors that `--write` couldn't fix, address them manually. Common issues:

- Unused imports (Biome's `noUnusedImports` if enabled)
- Variables that shadow outer scope

- [ ] **Step 3: Verify lint passes cleanly**

```bash
cd /Users/pauldiloreto/Projects/swanki && bun run lint
```

Expected: All workspaces pass with no errors.

- [ ] **Step 4: Verify tests still pass**

```bash
cd /Users/pauldiloreto/Projects/swanki && bun run test:run
```

Expected: All tests pass. Formatting changes should not affect behavior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: reformat codebase with biome"
```

---

### Task 6: Update CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the lint commands in Build & Dev Commands section**

Replace:

```
bun run lint             # oxlint + prettier check
bun run lint:fix         # auto-fix lint issues
```

With:

```
bun run lint             # biome lint + format check
bun run lint:fix         # auto-fix lint and format issues
```

- [ ] **Step 2: Update the Stack section linting entry**

Replace:

```
- **Linting**: oxlint (config: `apps/web/oxlint.config.mjs`) + prettier
```

With:

```
- **Linting**: Biome (config: `biome.json`)
```

- [ ] **Step 3: Update the Conventions section**

Replace:

```
- oxlint relaxes `typescript/no-unsafe-*` rules in test files and `src/lib/offline/**`
```

With:

```
- Biome recommended rules are used across all workspaces; config at root `biome.json`
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for biome migration"
```
