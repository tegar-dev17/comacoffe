"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api-client";
import { getStoredUser, getToken } from "../lib/auth";
import { formatIdr } from "../lib/format";

type Summary = {
  transactionCount: number;
  grossSalesMinor: number;
  averageTicketMinor: number;
  topProducts: Array<{ name: string; quantity: number; revenueMinor: number }>;
  recentOrders: Array<{ id: string; orderNumber: string; totalMinor: number; paidAt: string | null }>;
};

export function DashboardClient() {
  const token = getToken();
  const user = getStoredUser();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || user?.role === "cashier") return;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const qs = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    apiFetch<{ data: Summary }>(`/api/v1/reports/sales-summary?${qs.toString()}`, { token })
      .then((res) => setSummary(res.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [token, user?.role]);

  if (user?.role === "cashier") {
    return (
      <div>
        <h1>Selamat datang, {user.displayName}</h1>
        <p className="muted">Buka halaman kasir untuk memulai transaksi.</p>
        <Link href="/pos" className="button-link">
          Buka Kasir
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">Ringkasan 7 hari terakhir (order berstatus paid).</p>
      {error ? <p className="error">{error}</p> : null}
      {summary ? (
        <>
          <div className="grid">
            <div className="card">
              <div className="stat-label">Penjualan kotor</div>
              <div className="stat-value">{formatIdr(summary.grossSalesMinor)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Transaksi</div>
              <div className="stat-value">{summary.transactionCount}</div>
            </div>
            <div className="card">
              <div className="stat-label">Rata-rata tiket</div>
              <div className="stat-value">{formatIdr(summary.averageTicketMinor)}</div>
            </div>
          </div>
          <div className="card">
            <h2>Produk terlaris</h2>
            <ul>
              {summary.topProducts.map((p) => (
                <li key={p.name}>
                  {p.name} — {p.quantity} pcs ({formatIdr(p.revenueMinor)})
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2>Transaksi terbaru</h2>
            <ul>
              {summary.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`}>{o.orderNumber}</Link> — {formatIdr(o.totalMinor)}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="muted">Memuat data…</p>
      )}
    </div>
  );
}
