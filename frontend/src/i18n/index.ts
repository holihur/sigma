import { create } from "zustand";

export type Locale = "en" | "zh";

const dictionary: Record<Locale, Record<string, string>> = {
  en: {},
  zh: {},
};

let zhLoad: Promise<void> | null = null;

async function ensureLocale(locale: Locale): Promise<void> {
  if (locale !== "zh" || Object.keys(dictionary.zh).length > 0) return;
  if (!zhLoad) {
    zhLoad = import("./zh")
      .then((mod) => {
        dictionary.zh = mod.default;
        useI18n.setState((state) => ({ revision: state.revision + 1 }));
      })
      .catch((err) => {
        zhLoad = null;
        throw err;
      });
  }
  return zhLoad;
}

function detectLocale(): Locale {
  const stored = localStorage.getItem("sigma.locale");
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let value = dictionary[locale][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

interface I18nState {
  locale: Locale;
  revision: number;
  setLocale: (locale: Locale) => void;
  toggle: () => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: detectLocale(),
  revision: 0,
  setLocale: (locale) => {
    localStorage.setItem("sigma.locale", locale);
    applyLocale(locale);
    set({ locale });
    void ensureLocale(locale).catch(() => undefined);
  },
  toggle: () => get().setLocale(get().locale === "en" ? "zh" : "en"),
}));

export async function bootI18n() {
  const locale = useI18n.getState().locale;
  applyLocale(locale);
  await ensureLocale(locale).catch(() => undefined);
}

/** Hook returning a locale-aware translate function. */
export function useT() {
  const locale = useI18n((s) => s.locale);
  useI18n((s) => s.revision);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
