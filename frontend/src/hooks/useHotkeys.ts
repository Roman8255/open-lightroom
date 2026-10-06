import { useEffect } from "react";

/** Registers a keydown handler that ignores typing in inputs. */
export function useHotkeys(handler: (e: KeyboardEvent) => void, deps: unknown[] = []) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range") return;
      if (t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      handler(e);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
