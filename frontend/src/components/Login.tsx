import { type FormEvent, useState } from "react";
import { api } from "../api/client";
import type { User } from "../api/client";

export function Login({ onUser }: { onUser: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      onUser(await (mode === "login" ? api.login : api.register)(email, password));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="h-full grid place-items-center bg-lr-bar">
      <form onSubmit={submit} className="w-80 bg-lr-panel p-6 rounded shadow-xl flex flex-col gap-3 select-text">
        <h1 className="text-lg text-lr-hi font-light tracking-wide">Open <span className="text-lr-accent">Lightroom</span></h1>
        <input className="bg-lr-bar p-2 rounded outline-none focus:ring-1 ring-lr-accent" placeholder="Email" type="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <input className="bg-lr-bar p-2 rounded outline-none focus:ring-1 ring-lr-accent" placeholder="Password (min 8 chars)" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        {err && <p className="text-red-400">{err}</p>}
        <button className="bg-lr-accent text-black py-2 rounded font-medium hover:brightness-110">
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="text-lr-dim hover:text-lr-hi"
          onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
