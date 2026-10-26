"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => undefined,
});

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("careerpilot-theme");
    const nextTheme: Theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    window.localStorage.setItem("careerpilot-theme", nextTheme);
    setTheme(nextTheme);
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
