"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getStoredUser, getToken } from "@/lib/auth";
import { formatIdr } from "@/lib/format";

type Shift = {
  id: string;
  status: string;
  openingCashMinor: number;
  expectedCashMinor?: number | null;
  countedCashMinor?: number | null;
  cashVarianceMinor?: number | null;
  openedAt: string;
  closedAt?: string | null;
};

export default function ShiftsPage() {
  const token = getToken();
  const user = getStoredUser();
  const outletId = user?.outletId ?? "";
  const [current, setCurrent] = useState<Shift | null>(null);
  const [history, setHistory] = useState<Shift[]>([]);
  const [openingCash, setOpeningCash] = useState(0);
  const [countedCash, setCountedCash] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !outletId) return;
    const cur = await apiFetch<{ data: Shift | null }>(
      `/api/v1/shifts/current?outletId=${outletId}`,
      { token },
    );
    setCurrent(cur.data);
    const hist = await apiFetch<{ data: Shift[] }>(
      `/api/v1/shifts?outletId=${outletId}&limit=10`,
      { token },
    );
    setHistory(hist.data);
  }, [token, outletId]);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [refresh]);

  async function openShift() {
    if (!token || !outletId) return;
    await apiFetch("/api/v1/shifts/open", {
      method: "POST",
      token,
      body: JSON.stringify({ outletId, openingCashMinor: openingCash }),
    });
    await refresh();
  }

  async function closeShift() {
    if (!token || !current) return;
    await apiFetch(`/api/v1/shifts/${current.id}/close`, {
      method: "POST",
      token,
      body: JSON.stringify({ countedCashMinor: countedCash }),
    });
    await refresh();
  }

  if (!outletId) {
    return <p className="error">Akun perlu outlet untuk mengelola shift.</p>;
  }

  return (
    <div>
      <h1>Shift kasir</h1>
      {error ? <p className="error">{error}</p> : null}
      {!current ? (
        <div className="card stack">
          <h2>Buka shift</h2>
          <label>
            Modal awal (Rp)
            <input type="number" value={openingCash} onChange={(e) => setOpeningCash(Number(e.target.value))} />
          </label>
          <button type="button" onClick={() => void openShift()}>
            Buka shift
          </button>
        </div>
      ) : (
        <div className="card stack">
          <h2>Shift aktif</h2>
          <p>Modal awal: {formatIdr(current.openingCashMinor)}</p>
          <label>
            Uang di laci saat tutup (Rp)
            <input type="number" value={countedCash} onChange={(e) => setCountedCash(Number(e.target.value))} />
          </label>
          <button type="button" onClick={() => void closeShift()}>
            Tutup shift
          </button>
        </div>
      )}
      <div className="card">
        <h2>Riwayat</h2>
        <table>
          <thead>
            <tr>
              <th>Buka</th>
              <th>Status</th>
              <th>Selisih</th>
            </tr>
          </thead>
          <tbody>
            {history.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.openedAt).toLocaleString("id-ID")}</td>
                <td>{s.status}</td>
                <td>{s.cashVarianceMinor != null ? formatIdr(s.cashVarianceMinor) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
