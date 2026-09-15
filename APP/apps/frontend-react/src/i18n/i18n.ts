import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './language';
import { resources } from './resources';

export const appI18n = i18next.createInstance();

void appI18n.use(initReactI18next).init({
  resources,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false,
  },
  initImmediate: false,
});
