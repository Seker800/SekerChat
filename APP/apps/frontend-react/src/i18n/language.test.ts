import { afterEach, describe, expect, it } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  resolveInitialLanguage,
  setStoredLanguage,
} from './language';

describe('language preference', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('uses an explicit saved preference before route and browser language', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN');

    expect(
      resolveInitialLanguage({
        pathname: '/en',
        browserLanguages: ['en-US'],
        storage: window.localStorage,
      }),
    ).toBe('zh-CN');
  });

  it('uses the English public route when no preference has been saved', () => {
    expect(
      resolveInitialLanguage({
        pathname: '/en',
        browserLanguages: ['zh-CN'],
        storage: window.localStorage,
      }),
    ).toBe('en');
  });

  it('uses a supported browser language and falls back to Chinese', () => {
    expect(
      resolveInitialLanguage({
        pathname: '/',
        browserLanguages: ['en-GB', 'fr-FR'],
        storage: window.localStorage,
      }),
    ).toBe('en');

    expect(
      resolveInitialLanguage({
        pathname: '/',
        browserLanguages: ['fr-FR'],
        storage: window.localStorage,
      }),
    ).toBe('zh-CN');
  });

  it('normalizes supported variants and rejects unknown values', () => {
    expect(normalizeLanguage('zh-Hans-CN')).toBe('zh-CN');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('ja-JP')).toBeNull();
  });

  it('persists only supported language values', () => {
    setStoredLanguage('en', window.localStorage);
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
});
