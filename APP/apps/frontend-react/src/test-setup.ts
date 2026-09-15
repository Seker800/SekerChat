import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { appI18n } from './i18n/i18n';

afterEach(() => {
  cleanup();
  void appI18n.changeLanguage('zh-CN');
});
