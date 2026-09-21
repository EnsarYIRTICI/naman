"use client";
import { useState } from "react";
import { send } from "@/lib/api";

export default function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    if (!username.trim() || !password) return setMsg("Kullanıcı adı ve şifre gerekli.");
    setBusy(true);
    setMsg("");
    try {
      await send("POST", "/api/login", { username, password });
      onLoggedIn();
      return;
    } catch (e) {
      setMsg((e as Error).message);
      setP("");
    }
    setBusy(false);
  }

  const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-500";
  return (
    <div className="mx-auto mt-[12vh] max-w-sm px-5">
      <div className="mb-5 text-center">
        <h1 className="m-0 mb-1 text-xl font-semibold">🛒 Naman Yönetim</h1>
        <p className="m-0 text-sm text-neutral-500">Devam etmek için giriş yapın.</p>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <label htmlFor="u" className="mb-1 block text-xs text-neutral-500">Kullanıcı adı</label>
        <input id="u" className={input + " mb-3"} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus
          value={username} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
        <label htmlFor="p" className="mb-1 block text-xs text-neutral-500">Şifre</label>
        <input id="p" type="password" className={input + " mb-3"} autoComplete="current-password"
          value={password} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
        <button type="button" disabled={busy} onClick={login}
          className="w-full rounded-lg bg-neutral-800 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
          Giriş yap
        </button>
        <div className="mt-2 min-h-[18px] text-xs text-red-600" data-testid="login-msg">{msg}</div>
      </div>
    </div>
  );
}
