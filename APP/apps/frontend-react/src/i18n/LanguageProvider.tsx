import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { appI18n } from './i18n';
import {
  type AppLanguage,
  resolveInitialLanguage,
  setStoredLanguage,
} from './language';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readInitialLanguage(): AppLanguage {
  return resolveInitialLanguage({
    pathname: window.location.pathname,
    browserLanguages: navigator.languages,
    storage: window.localStorage,
  });
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>(readInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    void appI18n.changeLanguage(language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage(nextLanguage) {
        setStoredLanguage(nextLanguage, window.localStorage);
        document.documentElement.lang = nextLanguage;
        void appI18n.changeLanguage(nextLanguage);
        setLanguageState(nextLanguage);
      },
    }),
    [language],
  );

  return (
    <I18nextProvider i18n={appI18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used within LanguageProvider');
  return value;
}
