"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getToken } from "@/lib/auth";

type Status = {
  envProvider: string;
  envPaymentEnv: string;
  qrisAvailable: boolean;
  qrisStagingFallback?: boolean;
  midtransProductionReady?: boolean;
  note: string;
};

type ConfigRow = {
  id: string;
  provider: string;
  environment: string;
  status: string;
  serverCredentialRef: string | null;
  outletId: string | null;
};

export default function PaymentProviderPage() {
  const token = getToken();
  const [status, setStatus] = useState<Status | null>(null);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"midtrans" | "xendit">("midtrans");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("production");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch<{ data: Status }>("/api/v1/admin/merchant-configs/status", { token }),
      apiFetch<{ data: ConfigRow[] }>("/api/v1/admin/merchant-configs", { token }),
    ])
      .then(([s, c]) => {
        setStatus(s.data);
        setConfigs(c.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [token]);

  async function saveConfig() {
    if (!token) return;
    setError(null);
    try {
      await apiFetch("/api/v1/admin/merchant-configs", {
        method: "PUT",
        token,
        body: JSON.stringify({
          provider,
          environment,
          status: "active",
          serverCredentialRef:
            provider === "midtrans" ? "env:MIDTRANS_SERVER_KEY" : "env:XENDIT_SECRET_KEY",
        }),
      });
      const c = await apiFetch<{ data: ConfigRow[] }>("/api/v1/admin/merchant-configs", { token });
      setConfigs(c.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal simpan");
    }
  }

  return (
    <div>
      <h1>Payment provider</h1>
      {error ? <p className="error">{error}</p> : null}
      {status ? (
        <div className="card">
          <p>
            Env: <strong>{status.envProvider}</strong> / {status.envPaymentEnv}
          </p>
          <p>QRIS tersedia: {status.qrisAvailable ? "Ya" : "Tidak"}</p>
          <p>Midtrans production ready: {status.midtransProductionReady ? "Ya" : "Tidak"}</p>
          {status.qrisStagingFallback ? (
            <p className="muted">Mode staging fallback aktif (channel Midtrans belum live).</p>
          ) : null}
          <p className="muted">{status.note}</p>
        </div>
      ) : null}
      <div className="card stack">
        <h2>Merchant config (credential refs only)</h2>
        <label>
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value as "midtrans" | "xendit")}>
            <option value="midtrans">Midtrans</option>
            <option value="xendit">Xendit</option>
          </select>
        </label>
        <label>
          Environment
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as "sandbox" | "production")}
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </label>
        <button type="button" onClick={() => void saveConfig()}>
          Simpan config tenant (refs ke env server)
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Env</th>
              <th>Status</th>
              <th>Server ref</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id}>
                <td>{c.provider}</td>
                <td>{c.environment}</td>
                <td>{c.status}</td>
                <td>{c.serverCredentialRef ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
