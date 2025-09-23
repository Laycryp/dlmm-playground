'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = (resolvedTheme ?? theme) === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="btn btn-outline h-9 px-3 text-sm"
      aria-label="Toggle theme"
      title={isDark ? 'Switch to light' : 'Switch to dark'}
    >
      {isDark ? 'Light' : 'Dark'}
    </button>
  );
}
