"use client";

import { useState } from "react";
import { API_BASE, apiFetch } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { formatIdr } from "@/lib/format";

type Summary = {
  transactionCount: number;
  grossSalesMinor: number;
  averageTicketMinor: number;
  paymentMethods: Array<{ method: string; totalMinor: number; count: number }>;
  topProducts: Array<{ name: string; quantity: number; revenueMinor: number }>;
};

export default function ReportsPage() {
  const token = getToken();
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const res = await apiFetch<{ data: Summary }>(
        `/api/v1/reports/sales-summary?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`,
        { token },
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function exportCsv() {
    if (!token) return;
    const res = await fetch(
      `${API_BASE}/api/v1/reports/sales-summary.csv?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      setError("Export gagal");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>Laporan penjualan</h1>
      <div className="filters card">
        <label>
          Dari
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Sampai
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={() => void load()}>
          Muat
        </button>
        <button type="button" className="secondary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <div className="grid">
          <div className="card stat">
            <div className="stat-value">{data.transactionCount}</div>
            <div className="stat-label">Transaksi</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{formatIdr(data.grossSalesMinor)}</div>
            <div className="stat-label">Penjualan kotor</div>
          </div>
          <div className="card stat">
            <div className="stat-value">{formatIdr(data.averageTicketMinor)}</div>
            <div className="stat-label">Rata-rata tiket</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
