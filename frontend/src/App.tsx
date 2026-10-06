import { useEffect, useState } from "react";
import { type User, api } from "./api/client";
import { Login } from "./components/Login";
import { TopBar } from "./components/TopBar";
import { Develop } from "./modules/develop/Develop";
import { Library } from "./modules/library/Library";
import { useLibrary } from "./store/library";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { module, error, setError } = useLibrary();

  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, []);

  if (user === undefined) return null;
  if (user === null) return <Login onUser={setUser} />;

  return (
    <div className="h-full flex flex-col">
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
