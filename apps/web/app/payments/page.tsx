"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPayments } from "@/lib/api";
import { formatDateTimeId, formatIdr } from "@/lib/format";

export default function PaymentsPage() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<
    Array<{
      id: string;
      orderId: string;
      status: string;
      amountMinor: number;
      currency: string;
      provider: string;
      paymentMethod: string;
      createdAt: string;
    }>
  >([]);

  useEffect(() => {
    setMounted(true);
    const saved =
      window.localStorage.getItem("comacoffe_auth_token") ??
      window.localStorage.getItem("comacoffe_admin_token");
    if (saved) setToken(saved);
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const succeeded = rows.filter((r) => r.status === "SUCCEEDED").length;
    const pending = rows.filter((r) => r.status === "PENDING").length;
    const failed = rows.filter((r) => r.status === "FAILED").length;
    const unknown = rows.filter((r) => r.status === "UNKNOWN").length;
    const volume = rows.reduce((sum, r) => sum + r.amountMinor, 0);
    return { total, succeeded, pending, failed, unknown, volume };
  }, [rows]);

  async function load() {
    if (!token) {
      setError("JWT token wajib diisi");
      return;
    }
    window.localStorage.setItem("comacoffe_admin_token", token);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPayments({ token, status: status || undefined, provider: provider || undefined });
      setRows(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Payment Dashboard</h1>
      <p className="muted">Filter outlet/status/provider. Data diambil dari API backend dengan authorization JWT.</p>

      <div className="filters card">
        <input
          placeholder="Bearer token (dev: /api/v1/dev/token)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ minWidth: 280, flex: 1 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="SUCCEEDED">SUCCEEDED</option>
          <option value="PENDING">PENDING</option>
          <option value="FAILED">FAILED</option>
          <option value="UNKNOWN">UNKNOWN</option>
          <option value="REFUNDED">REFUNDED</option>
        </select>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">Semua provider</option>
          <option value="midtrans">midtrans</option>
          <option value="xendit">xendit</option>
          <option value="cash">cash</option>
        </select>
        <button onClick={() => void load()} disabled={loading}>
          {loading ? "Memuat..." : "Muat data"}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <div className="card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Transaksi (halaman ini)</div>
        </div>
        <div className="card">
          <div className="stat-value">{stats.succeeded}</div>
          <div className="stat-label">Berhasil</div>
        </div>
        <div className="card">
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="card">
          <div className="stat-value">{stats.failed}</div>
          <div className="stat-label">Gagal</div>
        </div>
        <div className="card">
          <div className="stat-value">{stats.unknown}</div>
          <div className="stat-label">Unknown</div>
        </div>
        <div className="card">
          <div className="stat-value">{mounted ? formatIdr(stats.volume) : "—"}</div>
          <div className="stat-label">Volume nominal</div>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">Belum ada data. Bootstrap API, buat order + payment, lalu muat ulang.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Order</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Metode</th>
                <th>Nominal</th>
                <th>Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <a href={`/payments/${row.id}`}>
                      <code>{row.id.slice(0, 8)}…</code>
                    </a>
                  </td>
                  <td>
                    <code>{row.orderId.slice(0, 8)}…</code>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.provider}</td>
                  <td>{row.paymentMethod}</td>
                  <td>{formatIdr(row.amountMinor)}</td>
                  <td>{formatDateTimeId(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
