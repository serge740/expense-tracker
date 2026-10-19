import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, LANGUAGES, STRINGS, StringKey } from '@/i18n/strings';

const STORAGE_KEY = 'app_language_v1';

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

/** First supported language from the device locale, else English. */
function deviceLanguage(): Language {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    const match = LANGUAGES.find(l => tag.startsWith(l.code));
    return match?.code ?? 'en';
  } catch {
    return 'en';
  }
}

const LanguageContext = createContext<Ctx>({
  language: 'en',
  setLanguage: () => {},
  t: key => STRINGS.en[key],
  locale: 'en-US',
  formatDate: d => new Date(d).toDateString(),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(deviceLanguage);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (v && v in STRINGS) setLanguageState(v as Language); })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((l: Language) => {
    setLanguageState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(() => {
    const dict = STRINGS[language];
    const locale = LANGUAGES.find(l => l.code === language)?.locale ?? 'en-US';
    return {
      language,
      setLanguage,
      locale,
      t: (key, vars) => {
        const raw = dict[key] ?? STRINGS.en[key] ?? key;
        return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : raw;
      },
      formatDate: (d, opts) => {
        const date = new Date(d);
        try { return date.toLocaleDateString(locale, opts); } catch { return date.toLocaleDateString('en-US', opts); }
      },
    };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useI18n = () => useContext(LanguageContext);
