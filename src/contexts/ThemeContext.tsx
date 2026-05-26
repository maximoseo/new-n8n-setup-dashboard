import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ThemeMode } from "../../shared/types";
import { fetchUserSettings, updateUserSettings } from "../api";
import { useAuth } from "./AuthContext";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const storageKey = "new-site-dashboard-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [mode, setModeState] = useState<ThemeMode>(() => (localStorage.getItem(storageKey) as ThemeMode | null) ?? "system");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  useEffect(() => {
    if (!session) return;
    fetchUserSettings()
      .then(({ settings }) => setModeState(settings.theme))
      .catch(() => undefined);
  }, [session]);

  function setMode(nextMode: ThemeMode) {
    setModeState(nextMode);
    localStorage.setItem(storageKey, nextMode);
    if (session) {
      updateUserSettings({ theme: nextMode }).catch(() => undefined);
    }
  }

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return value;
}
