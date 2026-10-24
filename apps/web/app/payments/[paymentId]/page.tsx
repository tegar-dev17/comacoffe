"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { formatDateTimeId, formatIdr } from "@/lib/format";

type PaymentInstructions = {
  type?: string;
  qrCodeUrl?: string;
  qrString?: string;
  expiresAt?: string;
  message?: string;
};

type Detail = {
  payment: {
    id: string;
    orderId: string;
    status: string;
    amountMinor: number;
    currency: string;
    provider: string;
    providerReference: string | null;
    createdAt: string;
    updatedAt: string;
    instructions?: PaymentInstructions | null;
  };
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    source: string;
    createdAt: string;
  }>;
};

export default function PaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const token = getToken();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setError("Login diperlukan");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetch<{ data: Detail }>(
        `/api/v1/payments/${params.paymentId}/detail`,
        { token },
      );
      setDetail(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, params.paymentId]);

  const refreshStatus = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await apiFetch(`/api/v1/payments/${params.paymentId}/refresh`, {
        method: "POST",
        token,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [token, params.paymentId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail || detail.payment.status !== "PENDING") return;
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [detail, refreshStatus]);

  const instructions = detail?.payment.instructions;
  const isPending = detail?.payment.status === "PENDING";

  return (
    <div>
      <h1>Pembayaran QRIS</h1>
      <p className="muted">
        Referensi: <code>{detail?.payment.providerReference ?? params.paymentId}</code>
      </p>
      <div className="filters card">
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Memuat…" : "Muat ulang"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void refreshStatus()}
          disabled={refreshing || !token}
        >
          {refreshing ? "Cek status…" : "Cek status Midtrans"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!detail ? (
        <p className="muted">Memuat detail pembayaran…</p>
      ) : (
        <>
          <div className="card">
            <p>
              <strong>Status:</strong>{" "}
              <span className={isPending ? "status-pending" : ""}>{detail.payment.status}</span>
            </p>
            <p>
              <strong>Order:</strong> {detail.payment.orderId}
            </p>
            <p>
              <strong>Nominal:</strong> {formatIdr(detail.payment.amountMinor)}
            </p>
            <p className="muted">
              Provider {detail.payment.provider} · Diperbarui {formatDateTimeId(detail.payment.updatedAt)}
            </p>
          </div>

          {isPending && instructions?.qrCodeUrl ? (
            <div className="card qris-panel">
              <h2>Scan QRIS</h2>
              <p className="muted">{instructions.message ?? "Scan dengan aplikasi pembayaran Anda."}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={instructions.qrCodeUrl}
                alt="QRIS payment code"
                className="qris-image"
              />
              {instructions.expiresAt ? (
                <p className="muted">Kedaluwarsa: {formatDateTimeId(instructions.expiresAt)}</p>
              ) : null}
            </div>
          ) : null}

          {detail.payment.status === "SUCCEEDED" ? (
            <p className="success">Pembayaran terverifikasi. Pesanan telah ditandai lunas.</p>
          ) : null}
          {detail.payment.status === "EXPIRED" || detail.payment.status === "FAILED" ? (
            <p className="error">Pembayaran {detail.payment.status.toLowerCase()}.</p>
          ) : null}

          <div className="card">
            <h2>Riwayat status</h2>
            <table>
              <thead>
                <tr>
                  <th>Dari</th>
                  <th>Ke</th>
                  <th>Sumber</th>
                  <th>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {detail.statusHistory.map((e) => (
                  <tr key={e.id}>
                    <td>{e.fromStatus ?? "—"}</td>
                    <td>{e.toStatus}</td>
                    <td>{e.source}</td>
                    <td>{formatDateTimeId(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
