"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { getToken } from "../../lib/auth";
import { formatDateTimeId, formatIdr } from "../../lib/format";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  totalMinor: number;
  paidAt: string | null;
  createdAt: string;
};

export default function OrdersPage() {
  const token = getToken();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: OrderRow[]; pagination: { total: number } }>(
      `/api/v1/orders?status=paid&limit=${limit}&page=${page}`,
      { token },
    )
      .then((res) => {
        setRows(res.data);
        setTotal(res.pagination?.total ?? res.data.length);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [token, page]);

  return (
    <div>
      <h1>Riwayat transaksi</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>No. order</th>
              <th>Total</th>
              <th>Dibayar</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{formatIdr(o.totalMinor)}</td>
                <td>{o.paidAt ? formatDateTimeId(o.paidAt) : "—"}</td>
                <td>
                  <Link href={`/orders/${o.id}`}>Struk</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="muted">Belum ada transaksi selesai.</p> : null}
      </div>
      <div className="filters">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Sebelumnya
        </button>
        <span className="muted">
          Halaman {page} · {total} transaksi
        </span>
        <button
          type="button"
          disabled={page * limit >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
