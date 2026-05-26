import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import type { ThemeMode } from "../../shared/types";

const modes: ThemeMode[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const nextMode = modes[(modes.indexOf(mode) + 1) % modes.length];
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <button className="btn-secondary" onClick={() => setMode(nextMode)} title={`Theme: ${mode}. Click for ${nextMode}.`}>
      <Icon size={17} />
      <span className="capitalize">{mode}</span>
    </button>
  );
}
