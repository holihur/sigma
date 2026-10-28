import { create } from "zustand";

type Theme = "dark" | "light";

function initial(): Theme {
  const stored = localStorage.getItem("sigma.theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial(),
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  setTheme: (theme) => {
    localStorage.setItem("sigma.theme", theme);
    apply(theme);
    set({ theme });
  },
}));

export function bootTheme() {
  apply(useTheme.getState().theme);
}
