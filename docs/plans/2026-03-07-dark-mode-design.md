# Dark Mode Design

## Overview

Add dark mode support to Swanki with a three-way toggle (Light / Dark / System), persisted per-user in the database, with no flash of wrong theme on any page.

## Current State

The styling infrastructure is already prepared:

- Tailwind CSS v4 with class-based dark variant: `@custom-variant dark (&:is(.dark *))`
- Complete CSS variables for light and dark themes in `globals.css` (oklch color space)
- shadcn/ui configured with `cssVariables: true`
- Components already use semantic color tokens (`bg-background`, `text-foreground`, etc.)
- Some components already have explicit `dark:` modifiers

What's missing is the runtime logic to toggle, persist, and serve the correct theme.

## Storage

Add a `theme` column to the `user` table in `auth-schema.ts`:

```
theme: text("theme").default("system")  // "light" | "dark" | "system"
```

One Drizzle migration, no new tables.

## Server-Side Theme Resolution

- `_authenticated.tsx` `beforeLoad` already calls `getSession()` and returns user data. Extend it to also return `user.theme`.
- `__root.tsx` renders `<html class="dark">` when the user's theme is `"dark"`, no class when `"light"`, and no class when `"system"` (delegated to client).
- For logged-out pages, no session exists — always defaults to `"system"`.

## Flash Prevention

A small inline `<script>` in `<head>` handles the "system" case and logged-out pages:

```js
if (
  !document.documentElement.classList.contains("dark") &&
  !document.documentElement.classList.contains("light")
) {
  if (matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.add("dark");
}
```

This runs synchronously before paint. For authenticated users with explicit light/dark preference, the server already renders the correct class — no script needed.

This follows the same pattern used by next-themes (the industry standard React theme library).

## Theme Toggle UI

### Header Quick Toggle

A small icon button on the right side of the header bar in `app-shell.tsx`. Cycles through modes on click:

- Sun icon = Light
- Moon icon = Dark
- Monitor icon = System

### Settings Page

A new "Appearance" card section in `settings.tsx` (between Profile and Change Password) with three radio-style options so users can see all choices and understand what "System" means.

Both controls call the same API and update the `<html>` class immediately.

## API Endpoint

`PUT /api/settings/theme` with body `{ theme: "light" | "dark" | "system" }`.

Updates the `user.theme` column. Follows existing patterns: `requireSession`, service class, `Response.json()`.

## Client-Side Theme Context

A `ThemeProvider` React context in `__root.tsx` (inside `QueryClientProvider`) provides:

- `theme` — current setting: `"light" | "dark" | "system"`
- `setTheme(theme)` — updates `<html>` class immediately, calls API to persist

Initialized from route context (`user.theme`) for authenticated routes, `"system"` for logged-out routes. For `"system"` mode, adds a `matchMedia` listener to react to OS preference changes in real-time.

## Decision Summary

| Decision             | Choice                                                               |
| -------------------- | -------------------------------------------------------------------- |
| Toggle mode          | Three-way: Light / Dark / System                                     |
| Toggle locations     | Header icon button + Settings Appearance section                     |
| Persistence          | `theme` column on `user` table                                       |
| SSR flash prevention | Server renders class for auth'd users; inline script for system mode |
| Client state         | React context provider                                               |
| API                  | `PUT /api/settings/theme`                                            |
