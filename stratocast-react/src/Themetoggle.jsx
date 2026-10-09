import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('sc:ui-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch { return 'light'; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sc:ui-theme', theme); } catch { /* private mode */ }
  }, [theme]);

  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button className="theme-fab" onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={label} aria-pressed={dark} title={label}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
        )}
      </svg>
      <span className="theme-fab-label">{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}