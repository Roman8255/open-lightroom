import { type ReactNode, useState } from "react";

export function Panel({ title, children, defaultOpen = true, onReset }: {
  title: string; children: ReactNode; defaultOpen?: boolean; onReset?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-lr-border">
      <header
        className="flex items-center justify-between h-7 px-3 bg-lr-panel2 cursor-pointer hover:text-lr-hi uppercase tracking-wide text-[11px] text-lr-text"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {onReset && open && (
            <button className="text-lr-dim hover:text-lr-hi normal-case" title="Reset section"
              onClick={(e) => { e.stopPropagation(); onReset(); }}>reset</button>
          )}
          <span className="text-lr-dim">{open ? "▾" : "▸"}</span>
        </span>
      </header>
      {open && <div className="px-3 py-2 bg-lr-panel">{children}</div>}
    </section>
  );
}
