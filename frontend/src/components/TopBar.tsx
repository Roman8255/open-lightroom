import type { User } from "../api/client";
import { type Module, useLibrary } from "../store/library";

const MODULES: { id: Module | null; label: string }[] = [
  { id: "library", label: "Library" }, { id: "develop", label: "Develop" }, { id: null, label: "Map" },
  { id: null, label: "Book" }, { id: null, label: "Slideshow" }, { id: null, label: "Print" }, { id: null, label: "Web" },
];

/** Classic layout: identity plate on the left, module picker on the right. */
export function TopBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { module, setModule } = useLibrary();
  return (
    <header className="lr-chrome h-[46px] bg-lr-bar border-b border-lr-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-sm bg-[#0b2a45] border border-[#2f6aa8] grid place-items-center text-[#5aa0e8] text-[13px] font-semibold tracking-tight">OL</div>
        <div className="leading-tight">
          <div className="text-[10px] text-lr-dim">{user.email}</div>
          <div className="text-[15px] text-lr-hi tracking-wide">Open Lightroom</div>
        </div>
      </div>
      <nav className="flex items-center text-[14px]">
        {MODULES.map((m, i) => (
          <span key={m.label} className="flex items-center">
            {i > 0 && <span className="text-[#444] mx-3">|</span>}
            {m.id ? (
              <button className={module === m.id ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"} onClick={() => setModule(m.id!)}>{m.label}</button>
            ) : (
              <span className="text-[#4a4a4a] cursor-default" title="Not available yet">{m.label}</span>
            )}
          </span>
        ))}
        <button className="ml-6 text-[11px] text-lr-dim hover:text-lr-hi" onClick={onLogout}>Sign out</button>
      </nav>
    </header>
  );
}
