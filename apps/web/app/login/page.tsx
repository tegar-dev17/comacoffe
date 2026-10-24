"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/api-client";
import { setSession } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("cashier@demo.coffee");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await login(email, password);
      setSession(res.data.token, {
        id: res.data.user.id,
        email: res.data.user.email,
        displayName: res.data.user.displayName,
        role: res.data.user.role,
        outletId: res.data.user.outletId,
        tenantId: res.data.user.tenantId,
      });
      router.push(res.data.user.role === "cashier" ? "/pos" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Masuk Comacoffe</h1>
        <p className="muted">Gunakan akun demo setelah bootstrap API.</p>
        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Memproses…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
