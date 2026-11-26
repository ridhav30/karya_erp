import { useEffect, useRef, useState } from 'react'
import { ThemeContext } from './theme-context.js'

const KEY = 'karya_erp_theme'

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)
  const timer = useRef(null)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => () => clearTimeout(timer.current), [])

  const toggleTheme = () => {
    // Fade every surface together while the class flips (see .theme-switching in index.css).
    const root = document.documentElement
    root.classList.add('theme-switching')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => root.classList.remove('theme-switching'), 250)
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return <ThemeContext value={{ theme, toggleTheme }}>{children}</ThemeContext>
}
