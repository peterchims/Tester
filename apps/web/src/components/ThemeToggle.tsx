'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from './icons';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tt-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    setTheme(stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function toggle() {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  // Render a same-sized placeholder until the real theme is known, so the
  // toggle doesn't pop in (or briefly show the wrong icon) after hydration.
  if (!theme) return <span className="themeToggle placeholder" aria-hidden="true" />;

  return (
    <button className="themeToggle" onClick={toggle} type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
