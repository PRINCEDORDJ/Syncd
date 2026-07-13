import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "theme";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) ?? null;
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    setThemeState(initial);
    apply(initial);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  };

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}