# Dark Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dark mode with a three-way toggle (Light/Dark/System), persisted per-user in the database, with no flash of wrong theme.

**Architecture:** Add a `theme` column to the `user` table. Server reads it during SSR and renders the correct class on `<html>`. A React context provides `theme`/`setTheme` to the UI. An inline script handles "system" mode for logged-out users. Toggle lives in the header and settings page.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start (SSR), React Context, Tailwind CSS v4 (class-based dark variant), lucide-react icons.

---

### Task 1: Add `theme` Column to User Table

**Files:**

- Modify: `apps/web/src/db/auth-schema.ts:4` (user table definition)
- Generate: `apps/web/drizzle/XXXX_*.sql` (migration)

**Step 1: Add theme column to schema**

In `apps/web/src/db/auth-schema.ts`, add the `theme` column to the `user` table:

```ts
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  theme: text("theme").default("system"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
```

**Step 2: Generate the migration**

Run: `cd apps/web && bun x drizzle-kit generate`
Expected: New SQL migration file in `apps/web/drizzle/`

**Step 3: Verify migration applies**

Run: `cd apps/web && bun --bun vitest run src/__tests__/smoke.test.ts`
Expected: PASS (smoke test uses `createTestDb()` which runs all migrations)

**Step 4: Commit**

```bash
git add apps/web/src/db/auth-schema.ts apps/web/drizzle/
git commit -m "feat: add theme column to user table"
```

---

### Task 2: Create UserSettingsService

**Files:**

- Create: `apps/web/src/lib/services/user-settings-service.ts`
- Create: `apps/web/src/__tests__/api/user-settings.test.ts`

**Step 1: Write the failing test**

Create `apps/web/src/__tests__/api/user-settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test-utils";
import { UserSettingsService } from "../../lib/services/user-settings-service";
import { user } from "../../db/schema";

type TestDb = ReturnType<typeof createTestDb>;

describe("UserSettingsService", () => {
  let db: TestDb;
  let service: UserSettingsService;
  const userId = "user-1";

  beforeEach(() => {
    db = createTestDb();
    service = new UserSettingsService(db);

    // Seed a user
    db.insert(user)
      .values({
        id: userId,
        name: "Test User",
        email: "test@example.com",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  });

  describe("getTheme", () => {
    it("returns 'system' by default", () => {
      const theme = service.getTheme(userId);
      expect(theme).toBe("system");
    });

    it("returns the stored theme", () => {
      service.setTheme(userId, "dark");
      const theme = service.getTheme(userId);
      expect(theme).toBe("dark");
    });

    it("returns 'system' for non-existent user", () => {
      const theme = service.getTheme("non-existent");
      expect(theme).toBe("system");
    });
  });

  describe("setTheme", () => {
    it("updates theme to dark", () => {
      service.setTheme(userId, "dark");
      const theme = service.getTheme(userId);
      expect(theme).toBe("dark");
    });

    it("updates theme to light", () => {
      service.setTheme(userId, "light");
      const theme = service.getTheme(userId);
      expect(theme).toBe("light");
    });

    it("updates theme back to system", () => {
      service.setTheme(userId, "dark");
      service.setTheme(userId, "system");
      const theme = service.getTheme(userId);
      expect(theme).toBe("system");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/user-settings.test.ts`
Expected: FAIL — module not found

**Step 3: Write the service**

Create `apps/web/src/lib/services/user-settings-service.ts`:

```ts
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema";
import { user } from "../../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;
type Theme = "light" | "dark" | "system";

export class UserSettingsService {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  getTheme(userId: string): Theme {
    const row = this.db
      .select({ theme: user.theme })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    return (row?.theme as Theme) ?? "system";
  }

  setTheme(userId: string, theme: Theme): void {
    this.db.update(user).set({ theme }).where(eq(user.id, userId)).run();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/web && bun --bun vitest run src/__tests__/api/user-settings.test.ts`
Expected: PASS — all 6 tests

**Step 5: Commit**

```bash
git add apps/web/src/lib/services/user-settings-service.ts apps/web/src/__tests__/api/user-settings.test.ts
git commit -m "feat: add UserSettingsService for theme persistence"
```

---

### Task 3: Create Theme API Route

**Files:**

- Create: `apps/web/src/routes/api/settings/theme.ts`

**Step 1: Create the API route**

Create `apps/web/src/routes/api/settings/theme.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "../../../lib/auth-middleware";
import { UserSettingsService } from "../../../lib/services/user-settings-service";
import { db } from "../../../db";

const settingsService = new UserSettingsService(db);

export const Route = createFileRoute("/api/settings/theme")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireSession(request);
        const theme = settingsService.getTheme(session.user.id);
        return Response.json({ theme });
      },
      PUT: async ({ request }) => {
        const session = await requireSession(request);
        const body = (await request.json()) as { theme?: string };
        const theme = body.theme;
        if (theme !== "light" && theme !== "dark" && theme !== "system") {
          return Response.json(
            { error: "Invalid theme. Must be 'light', 'dark', or 'system'" },
            { status: 400 },
          );
        }
        settingsService.setTheme(session.user.id, theme);
        return Response.json({ theme });
      },
    },
  },
});
```

**Step 2: Verify lint passes**

Run: `cd apps/web && bun run lint`
Expected: PASS — no lint errors in the new file

**Step 3: Commit**

```bash
git add apps/web/src/routes/api/settings/theme.ts
git commit -m "feat: add PUT /api/settings/theme endpoint"
```

---

### Task 4: Create ThemeProvider Context

**Files:**

- Create: `apps/web/src/lib/theme.tsx`

**Step 1: Create the theme context and provider**

Create `apps/web/src/lib/theme.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyThemeClass(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.add("light");
  } else {
    // "system" — check OS preference
    if (globalThis.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    }
  }
}

type ThemeProviderProps = {
  initialTheme: Theme;
  children: React.ReactNode;
};

export function ThemeProvider({
  initialTheme,
  children,
}: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    applyThemeClass(newTheme);

    // Persist to server (fire-and-forget)
    void fetch("/api/settings/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: newTheme }),
    });
  }, []);

  // Listen for OS preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent): void => {
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      if (e.matches) {
        root.classList.add("dark");
      }
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
```

**Step 2: Verify lint passes**

Run: `cd apps/web && bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/lib/theme.tsx
git commit -m "feat: add ThemeProvider context with system preference detection"
```

---

### Task 5: Wire Up Server-Side Theme in Root and Authenticated Layout

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/lib/auth-session.ts`

Note: `_authenticated.tsx` stays unchanged — theme is resolved at root level.

**Step 1: Add getUserTheme server function**

Add to `apps/web/src/lib/auth-session.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth";
import { UserSettingsService } from "./services/user-settings-service";
import { db } from "../db";

const settingsService = new UserSettingsService(db);

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({
      headers: headers,
    });
    return session;
  },
);

export const getUserTheme = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({
      headers: headers,
    });
    if (!session) return "system";
    return settingsService.getTheme(session.user.id);
  },
);
```

**Step 2: Update `__root.tsx` with ThemeProvider and inline script**

Replace `apps/web/src/routes/__root.tsx` with:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { getUserTheme } from "@/lib/auth-session";

const queryClient = new QueryClient();

export const Route = createRootRoute({
  beforeLoad: async () => {
    const theme = await getUserTheme();
    return { theme: theme as "light" | "dark" | "system" };
  },
  head: () => ({
    meta: [
      { charSet: "utf8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Swanki" },
    ],
    links: [{ rel: "stylesheet", href: "/src/styles/globals.css" }],
  }),
  component: RootComponent,
});

// Inline script to handle "system" mode before paint.
// Content is a hardcoded constant — not user input — so no XSS risk.
const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,c=d.classList;if(!c.contains('dark')&&!c.contains('light')){if(window.matchMedia('(prefers-color-scheme:dark)').matches)c.add('dark')}})();`;

function RootComponent(): React.ReactElement {
  const { theme } = Route.useRouteContext();

  const htmlClass =
    theme === "dark" ? "dark" : theme === "light" ? "light" : undefined;

  return (
    <html lang="en" className={htmlClass}>
      <head>
        <HeadContent />
        {/* eslint-disable-next-line react/no-danger -- hardcoded constant, not user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider initialTheme={theme}>
            <TooltipProvider>
              <Outlet />
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

**Step 3: Verify dev server starts**

Run: `cd /Users/pauldiloreto/Projects/swanki/.claude/worktrees/dark-mode && bun run dev:web`
Expected: Dev server starts on port 3000 without errors. Kill after verifying.

**Step 4: Commit**

```bash
git add apps/web/src/lib/auth-session.ts apps/web/src/routes/__root.tsx
git commit -m "feat: wire up server-side theme resolution with SSR"
```

---

### Task 6: Add Theme Toggle to Header

**Files:**

- Modify: `apps/web/src/components/app-shell.tsx`

**Step 1: Add theme toggle button to the header**

Replace `apps/web/src/components/app-shell.tsx` with:

```tsx
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/sidebar";
import { useTheme } from "@/lib/theme";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AppShellProps = {
  user: {
    name: string;
    email: string;
    image?: string | undefined;
  };
  children: React.ReactNode;
};

const themeOrder: Array<"light" | "dark" | "system"> = [
  "light",
  "dark",
  "system",
];
const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;
const themeLabels = {
  light: "Light",
  dark: "Dark",
  system: "System",
} as const;

export function AppShell({
  user,
  children,
}: AppShellProps): React.ReactElement {
  const { theme, setTheme } = useTheme();

  function cycleTheme(): void {
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  }

  const Icon = themeIcons[theme];

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <h1 className="text-sm font-medium text-muted-foreground">Swanki</h1>
          <div className="ml-auto">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={cycleTheme}
                    className="size-8"
                  />
                }
              >
                <Icon className="size-4" />
                <span className="sr-only">Theme: {themeLabels[theme]}</span>
              </TooltipTrigger>
              <TooltipContent>Theme: {themeLabels[theme]}</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

**Step 2: Verify lint passes**

Run: `cd apps/web && bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/app-shell.tsx
git commit -m "feat: add theme toggle button in header"
```

---

### Task 7: Add Appearance Section to Settings Page

**Files:**

- Modify: `apps/web/src/routes/_authenticated/settings.tsx`

**Step 1: Add useTheme import**

Add at the top of `apps/web/src/routes/_authenticated/settings.tsx`:

```ts
import { useTheme } from "@/lib/theme";
```

**Step 2: Insert AppearanceSection in the render**

In the `SettingsPage` component, add `<AppearanceSection />` between `<UserInfoSection>` and `<ChangePasswordSection>`:

```tsx
<UserInfoSection name={user.name} email={user.email} />

<Separator />

<AppearanceSection />

<Separator />

<ChangePasswordSection />
```

**Step 3: Add the AppearanceSection component**

Add this component to the same file:

```tsx
/* ---------- Appearance ---------- */

const themeOptions: Array<{
  value: "light" | "dark" | "system";
  label: string;
  description: string;
}> = [
  { value: "light", label: "Light", description: "Always use light theme" },
  { value: "dark", label: "Dark", description: "Always use dark theme" },
  {
    value: "system",
    label: "System",
    description: "Follow your operating system setting",
  },
];

function AppearanceSection(): React.ReactElement {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Swanki looks to you.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {themeOptions.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                theme === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
                className="sr-only"
              />
              <div>
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Verify lint passes**

Run: `cd apps/web && bun run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/routes/_authenticated/settings.tsx
git commit -m "feat: add Appearance section to Settings page"
```

---

### Task 8: Final Verification

**Step 1: Run all tests**

Run: `cd apps/web && bun --bun vitest run`
Expected: All tests pass (existing + new user-settings tests)

**Step 2: Run lint**

Run: `cd /Users/pauldiloreto/Projects/swanki/.claude/worktrees/dark-mode && bun run lint`
Expected: PASS

**Step 3: Manual smoke test**

Run: `cd /Users/pauldiloreto/Projects/swanki/.claude/worktrees/dark-mode && bun run dev:web`
Verify:

1. Settings page shows Appearance section between Profile and Change Password
2. Selecting "Dark" immediately switches the entire UI to dark mode
3. Selecting "Light" switches back
4. Selecting "System" follows OS preference
5. Refresh the page — theme persists with no flash
6. Header toggle cycles through all three modes
7. Both controls stay in sync
8. Log out and back in — theme persists

**Step 4: Final commit if any fixes needed**

Only if test/lint failures require changes.
