import { clsx } from "clsx";
import type { ReactNode } from "react";

type NoteType = "critical" | "warning" | "info" | "tip";

interface ImplementationNoteProps {
	type?: NoteType;
	title: string;
	children: ReactNode;
	app?: string;
}

const noteConfig: Record<NoteType, { className: string; icon: string; iconBg: string }> = {
	critical: {
		className: "note-critical",
		icon: "!",
		iconBg: "bg-red-500",
	},
	warning: {
		className: "note-warning",
		icon: "~",
		iconBg: "bg-amber-500",
	},
	info: {
		className: "note-info",
		icon: "→",
		iconBg: "bg-orange-500",
	},
	tip: {
		className: "note-tip",
		icon: "✓",
		iconBg: "bg-green-500",
	},
};

export function ImplementationNote({
	type = "warning",
	title,
	children,
	app,
}: ImplementationNoteProps) {
	const config = noteConfig[type];

	return (
		<div className={clsx("my-4 flex gap-3 rounded-lg border p-4", config.className)}>
			<div
				className={clsx(
					"flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
					config.iconBg,
				)}
			>
				{config.icon}
			</div>
			<div className="flex-1">
				<div className="flex items-center gap-2">
					<h4 className="font-semibold text-[var(--color-text-primary)]">{title}</h4>
					{app && (
						<span className="rounded bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
							{app}
						</span>
					)}
				</div>
				<div className="mt-1 text-sm text-[var(--color-text-secondary)]">{children}</div>
			</div>
		</div>
	);
}
