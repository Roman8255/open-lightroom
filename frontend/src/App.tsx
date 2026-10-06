import { useEffect, useState } from "react";
import { type User, api } from "./api/client";
import { Login } from "./components/Login";
import { TopBar } from "./components/TopBar";
import { Develop } from "./modules/develop/Develop";
import { Library } from "./modules/library/Library";
import { CopyDialog } from "./components/CopyDialog";
import { useHotkeys } from "./hooks/useHotkeys";
import { useLibrary } from "./store/library";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { module, error, setError, panels, lights, setPanels, setLights } = useLibrary();

  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, []);

  useHotkeys((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === "Tab") { e.preventDefault(); setPanels(e.shiftKey ? (panels === 2 ? 0 : 2) : panels === 1 ? 0 : 1); }
    else if (k === "l") setLights(((lights + 1) % 3) as 0 | 1 | 2);
    else if (k === "f") { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }
  }, [panels, lights]);

  if (user === undefined) return null;
  if (user === null) return <Login onUser={setUser} />;

  return (
    <div className="h-full flex flex-col" data-panels={panels} data-lights={lights}>
      <CopyDialog />
      <TopBar user={user} onLogout={async () => { await api.logout(); setUser(null); }} />
      {module === "library" ? <Library /> : <Develop />}
      {error && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 bg-red-900 text-white px-4 py-2 rounded shadow-lg cursor-pointer" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}
