import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const VALID_THEMES: ReadonlySet<string> = new Set(["light", "dark", "system"]);

function validateTheme(value: unknown): Theme {
  return typeof value === "string" && VALID_THEMES.has(value)
    ? (value as Theme)
    : "system";
}

export function ThemeProvider({
  initialTheme,
  children,
}: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<Theme>(validateTheme(initialTheme));

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
    if (theme !== "system") {
      return;
    }

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

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
