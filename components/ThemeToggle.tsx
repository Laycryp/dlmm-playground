'use client';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    try {
      const root = document.documentElement;
      const saved = localStorage.getItem('theme');
      const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved ? saved === 'dark' : prefers;
      root.classList.toggle('dark', isDark);
      setDark(isDark);
    } finally {
      setReady(true);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setDark(next);
  };

  if (!ready) return null;

  return (
    <button onClick={toggle} className="btn btn-outline text-xs px-3 py-1.5">
      {dark ? 'Light' : 'Dark'}
    </button>
  );
}
