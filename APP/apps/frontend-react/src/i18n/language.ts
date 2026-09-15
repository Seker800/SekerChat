export const SUPPORTED_LANGUAGES = ['zh-CN', 'en'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'zh-CN';
export const LANGUAGE_STORAGE_KEY = 'sekerchat:language';

type LanguageStorage = Pick<Storage, 'getItem' | 'setItem'>;

type InitialLanguageOptions = {
  pathname: string;
  browserLanguages: readonly string[];
  storage?: Pick<Storage, 'getItem'> | null;
};

export function normalizeLanguage(language: string | null | undefined): AppLanguage | null {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return null;
}

export function resolveInitialLanguage({
  pathname,
  browserLanguages,
  storage,
}: InitialLanguageOptions): AppLanguage {
  const storedLanguage = normalizeLanguage(storage?.getItem(LANGUAGE_STORAGE_KEY));
  if (storedLanguage) return storedLanguage;

  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';

  for (const browserLanguage of browserLanguages) {
    const supportedLanguage = normalizeLanguage(browserLanguage);
    if (supportedLanguage) return supportedLanguage;
  }

  return DEFAULT_LANGUAGE;
}

export function setStoredLanguage(language: AppLanguage, storage: LanguageStorage): void {
  storage.setItem(LANGUAGE_STORAGE_KEY, language);
}
