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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: OrderRow[] }>("/api/v1/orders?status=paid&limit=50", { token })
      .then((res) => setRows(res.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [token]);

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
    </div>
  );
}
