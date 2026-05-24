import React, { createContext, useContext, useState, useEffect } from 'react'
import type { ThemeVars } from '@mysten/dapp-kit'

interface ThemeContextProps {
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return (
      document.documentElement.classList.contains('dark') ||
      localStorage.getItem('surveysui:theme') === 'dark'
    )
  })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const toggleTheme = () => {
    const nextDark = !isDark
    setIsDark(nextDark)
    localStorage.setItem('surveysui:theme', nextDark ? 'dark' : 'light')
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// A custom dark theme for @mysten/dapp-kit to match SurveySui dark styling
export const darkTheme: ThemeVars = {
  blurs: {
    modalOverlay: 'blur(4px)',
  },
  backgroundColors: {
    primaryButton: '#1f2937', // neutral-800
    primaryButtonHover: '#374151', // neutral-700
    outlineButtonHover: '#1f2937',
    modalOverlay: 'rgba(0, 0, 0, 0.65)',
    modalPrimary: '#171717', // neutral-900
    modalSecondary: '#262626', // neutral-800
    iconButton: 'transparent',
    iconButtonHover: '#262626',
    dropdownMenu: '#171717', // neutral-900
    dropdownMenuSeparator: '#262626', // neutral-800
    walletItemSelected: '#262626',
    walletItemHover: 'rgba(38, 38, 38, 0.7)',
  },
  borderColors: {
    outlineButton: '#374151',
  },
  colors: {
    primaryButton: '#f3f4f6', // neutral-100
    outlineButton: '#f3f4f6',
    iconButton: '#ffffff',
    body: '#f3f4f6', // neutral-100
    bodyMuted: '#9ca3af', // gray-400
    bodyDanger: '#ef4444',
  },
  radii: {
    small: '6px',
    medium: '8px',
    large: '12px',
    xlarge: '16px',
  },
  shadows: {
    primaryButton: '0px 4px 12px rgba(0, 0, 0, 0.5)',
    walletItemSelected: '0px 2px 6px rgba(0, 0, 0, 0.3)',
  },
  fontWeights: {
    normal: '400',
    medium: '500',
    bold: '600',
  },
  fontSizes: {
    small: '14px',
    medium: '16px',
    large: '18px',
    xlarge: '20px',
  },
  typography: {
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    fontStyle: 'normal',
    lineHeight: '1.3',
    letterSpacing: '1',
  },
}
