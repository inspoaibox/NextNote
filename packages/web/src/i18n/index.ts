import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en } from './locales/en';
import { zh } from './locales/zh';

export type Locale = 'en' | 'zh';
export type Translations = typeof en;

const locales: Record<Locale, Translations> = { en, zh };

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: (navigator.language.startsWith('zh') ? 'zh' : 'en') as Locale,
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'i18n-storage' }
  )
);

type NestedKeyOf<T> = T extends object
  ? { [K in keyof T]: K extends string ? (T[K] extends object ? `${K}.${NestedKeyOf<T[K]>}` : K) : never }[keyof T]
  : never;

type TranslationKey = NestedKeyOf<Translations>;

function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? path;
}

export function useI18n() {
  const { locale, setLocale } = useI18nStore();
  const translations = locales[locale];

  const t = (key: TranslationKey | string): string => {
    return getNestedValue(translations, key);
  };

  return { t, locale, setLocale, locales: Object.keys(locales) as Locale[] };
}

export { en, zh };
