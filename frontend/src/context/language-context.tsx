import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage';
import { LANGUAGES, STRINGS, type Language, type StringKey } from '@/i18n/strings';

const STORAGE_KEY = 'app_language_v1'; // same key as the phone app

type Vars = Record<string, string | number>;

type Ctx = {
  language: Language;
  setLanguage: (l: Language) => void;
  /** Translate a key, filling {placeholders} from vars. */
  t: (key: StringKey, vars?: Vars) => string;
  /** BCP-47 locale for dates/numbers (e.g. fr-FR). */
  locale: string;
  /** Locale-aware date formatting that falls back to English if unsupported. */
  formatDate: (d: Date | string, opts: Intl.DateTimeFormatOptions) => string;
};

/** The saved choice, else the first supported language from the browser, else English. */
function initialLanguage(): Language {
  const saved = storage.get(STORAGE_KEY);
  if (saved && saved in STRINGS) return saved as Language;
  try {
    const tags = (navigator.languages?.length ? navigator.languages : [navigator.language]).map(l => l.toLowerCase());
    for (const tag of tags) {
      const match = LANGUAGES.find(l => tag.startsWith(l.code));
      if (match) return match.code;
    }
  } catch { /* fall through */ }
  return 'en';
}

/** Pure, so it can be tested without a screen. */
export function translate(language: Language, key: StringKey, vars?: Vars): string {
  const raw = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : raw;
}

const LanguageContext = createContext<Ctx>({
  language: 'en',
  setLanguage: () => {},
  t: key => STRINGS.en[key],
  locale: 'en-US',
  formatDate: d => new Date(d).toDateString(),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((l: Language) => {
    setLanguageState(l);
    storage.set(STORAGE_KEY, l);
  }, []);

  const value = useMemo<Ctx>(() => {
    const locale = LANGUAGES.find(l => l.code === language)?.locale ?? 'en-US';
    return {
      language,
      setLanguage,
      locale,
      t: (key, vars) => translate(language, key, vars),
      formatDate: (d, opts) => {
        const date = new Date(d);
        try { return date.toLocaleDateString(locale, opts); } catch { return date.toLocaleDateString('en-US', opts); }
      },
    };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useI18n = () => useContext(LanguageContext);
