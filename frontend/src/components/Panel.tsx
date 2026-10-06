import { type ReactNode, useState } from "react";

/** Lightroom Classic panel: title-case header with a collapse triangle on the right. */
export function Panel({ title, children, defaultOpen = true, onReset, disabled }: {
  title: string; children?: ReactNode; defaultOpen?: boolean; onReset?: () => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen && !disabled);
  return (
    <section className="border-b border-lr-border">
      <header
        className={`flex items-center justify-between h-[26px] px-3 bg-gradient-to-b from-[#3b3b3b] to-[#323232] border-t border-[#454545] text-[11px] ${
          disabled ? "text-lr-dim" : "text-lr-text hover:text-lr-hi cursor-pointer"}`}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {onReset && open && (
            <button className="text-lr-dim hover:text-lr-hi" title="Reset section"
              onClick={(e) => { e.stopPropagation(); onReset(); }}>Reset</button>
          )}
          <span className="text-[9px] text-lr-dim">{open ? "▼" : "◀"}</span>
        </span>
      </header>
      {open && <div className="px-3 py-2 bg-lr-panel">{children}</div>}
    </section>
  );
}
