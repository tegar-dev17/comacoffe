"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { formatDateTimeId, formatIdr } from "@/lib/format";

type PendingRefund = {
  id: string;
  paymentId: string;
  orderId: string;
  amountMinor: number;
  reason: string;
  providerReference: string | null;
  createdAt: string;
};

function newIdempotencyKey(): string {
  return `refund-ui-${crypto.randomUUID()}`;
}

export default function RefundsPage() {
  const token = getToken();
  const [rows, setRows] = useState<PendingRefund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch<{ data: PendingRefund[] }>("/api/v1/refunds/pending", { token });
    setRows(res.data);
  }, [token]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [load]);

  async function approve(row: PendingRefund) {
    if (!token) return;
    setBusyId(row.id);
    setError(null);
    try {
      await apiFetch(`/api/v1/payments/${row.paymentId}/refunds/${row.id}/approve`, {
        method: "POST",
        token,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal approve");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: PendingRefund) {
    if (!token) return;
    const note = window.prompt("Alasan penolakan (min 3 karakter):")?.trim();
    if (!note || note.length < 3) return;
    setBusyId(row.id);
    try {
      await apiFetch(`/api/v1/payments/${row.paymentId}/refunds/${row.id}/reject`, {
        method: "POST",
        token,
        body: JSON.stringify({ reason: note }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal reject");
    } finally {
      setBusyId(null);
    }
  }

  async function requestRefund(paymentId: string) {
    if (!token) return;
    const amount = window.prompt("Nominal refund (minor, e.g. 28000):");
    if (!amount) return;
    const reason = window.prompt("Alasan refund:")?.trim();
    if (!reason) return;
    try {
      await apiFetch(`/api/v1/payments/${paymentId}/refunds`, {
        method: "POST",
        token,
        body: JSON.stringify({
          amountMinor: Number(amount),
          reason,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal buat refund");
    }
  }

  return (
    <div>
      <h1>Refund — persetujuan</h1>
      <p className="muted">Refund besar atau dari kasir memerlukan approval supervisor/admin.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Payment</th>
              <th>Nominal</th>
              <th>Alasan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTimeId(r.createdAt)}</td>
                <td>
                  <code>{r.providerReference ?? r.paymentId.slice(0, 8)}</code>
                </td>
                <td>{formatIdr(r.amountMinor)}</td>
                <td>{r.reason}</td>
                <td>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void approve(r)}
                  >
                    Setujui
                  </button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyId === r.id}
                    onClick={() => void reject(r)}
                  >
                    Tolak
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="muted">Tidak ada refund menunggu approval.</p> : null}
      </div>
      <p className="muted">
        Buat refund dari payment ID:{" "}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            const pid = window.prompt("Payment UUID:");
            if (pid) void requestRefund(pid);
          }}
        >
          Refund manual…
        </button>
      </p>
    </div>
  );
}
