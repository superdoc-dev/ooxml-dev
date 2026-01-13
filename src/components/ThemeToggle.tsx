import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();

	const cycleTheme = () => {
		if (theme === "light") setTheme("dark");
		else if (theme === "dark") setTheme("system");
		else setTheme("light");
	};

	return (
		<button
			onClick={cycleTheme}
			className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition"
			title={`Theme: ${theme}`}
		>
			{theme === "light" && <Sun size={18} />}
			{theme === "dark" && <Moon size={18} />}
			{theme === "system" && <Monitor size={18} />}
		</button>
	);
}
