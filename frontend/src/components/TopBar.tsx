import type { User } from "../api/client";
import { type Module, useLibrary } from "../store/library";

export function TopBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { module, setModule } = useLibrary();
  const items: { id: Module; label: string }[] = [{ id: "library", label: "Library" }, { id: "develop", label: "Develop" }];
  return (
    <header className="h-10 bg-lr-bar border-b border-lr-border flex items-center justify-between px-4 shrink-0">
      <div className="text-lr-hi text-sm font-light tracking-wide">Open <span className="text-lr-accent">Lightroom</span></div>
      <nav className="flex items-center gap-1 text-[13px]">
        {items.map((it, i) => (
          <span key={it.id} className="flex items-center">
            {i > 0 && <span className="text-lr-line mx-2">|</span>}
            <button className={module === it.id ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"} onClick={() => setModule(it.id)}>
              {it.label}
            </button>
          </span>
        ))}
        {["Map", "Book", "Slideshow", "Print", "Web"].map((n) => (
          <span key={n} className="flex items-center text-lr-line" title="Not available yet"><span className="mx-2">|</span>{n}</span>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-lr-dim">
        <span>{user.email}</span>
        <button className="hover:text-lr-hi" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}
