import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from './LanguageProvider';
import { LANGUAGE_STORAGE_KEY } from './language';

function LanguageHarness() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <span>{language}</span>
      <button type="button" onClick={() => setLanguage(language === 'en' ? 'zh-CN' : 'en')}>
        switch
      </button>
    </div>
  );
}

describe('LanguageProvider', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    document.documentElement.lang = '';
  });

  it('initializes from the English public route', () => {
    window.history.replaceState(null, '', '/en');

    render(
      <LanguageProvider>
        <LanguageHarness />
      </LanguageProvider>,
    );

    expect(screen.getByText('en')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('persists a manual language change and updates the document language', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN');

    render(
      <LanguageProvider>
        <LanguageHarness />
      </LanguageProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'switch' }));

    expect(screen.getByText('en')).toBeInTheDocument();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
