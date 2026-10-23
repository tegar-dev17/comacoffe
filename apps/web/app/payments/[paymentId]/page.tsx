"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatIdr } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

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
  };
  statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; source: string; createdAt: string }>;
  refunds: Array<{ id: string; amountMinor: number; status: string; approvalStatus: string; reason: string; createdAt: string }>;
  reconciliations: Array<{ id: string; status: string; notes: string | null; providerStatus: string | null; createdAt: string }>;
  inquiries: Array<{ id: string; attemptNumber: number; httpStatus: number | null; errorMessage: string | null; createdAt: string }>;
};

export default function PaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("comacoffe_admin_token");
    if (saved) setToken(saved);
  }, []);

  async function load() {
    if (!token) {
      setError("JWT token wajib");
      return;
    }
    window.localStorage.setItem("comacoffe_admin_token", token);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/payments/${params.paymentId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Gagal memuat detail (${res.status})`);
      const json = (await res.json()) as { data: Detail };
      setDetail(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Payment Detail</h1>
      <p className="muted">
        ID: <code>{params.paymentId}</code>
      </p>
      <div className="filters card">
        <input
          placeholder="Bearer token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button onClick={() => void load()} disabled={loading}>
          {loading ? "Memuat..." : "Muat detail"}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!detail ? (
        <p className="muted">Belum ada data detail.</p>
      ) : (
        <>
          <div className="card">
            <p>
              <strong>Status:</strong> {detail.payment.status}
            </p>
            <p>
              <strong>Order:</strong> {detail.payment.orderId}
            </p>
            <p>
              <strong>Provider:</strong> {detail.payment.provider} / {detail.payment.providerReference ?? "—"}
            </p>
            <p>
              <strong>Nominal:</strong> {formatIdr(detail.payment.amountMinor)}
            </p>
            <p className="muted">
              Dibuat {new Date(detail.payment.createdAt).toLocaleString("id-ID")} · Diperbarui{" "}
              {new Date(detail.payment.updatedAt).toLocaleString("id-ID")}
            </p>
          </div>
          <div className="card">
            <h2>Riwayat status</h2>
            {detail.statusHistory.length === 0 ? (
              <p className="muted">Kosong</p>
            ) : (
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
                      <td>{new Date(e.createdAt).toLocaleString("id-ID")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2>Refund</h2>
            {detail.refunds.length === 0 ? (
              <p className="muted">Belum ada refund</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nominal</th>
                    <th>Status</th>
                    <th>Approval</th>
                    <th>Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.refunds.map((r) => (
                    <tr key={r.id}>
                      <td>{formatIdr(r.amountMinor)}</td>
                      <td>{r.status}</td>
                      <td>{r.approvalStatus}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2>Rekonsiliasi</h2>
            {detail.reconciliations.length === 0 ? (
              <p className="muted">Tidak ada exception</p>
            ) : (
              <ul>
                {detail.reconciliations.map((r) => (
                  <li key={r.id}>
                    {r.status} — {r.notes ?? r.providerStatus} ({new Date(r.createdAt).toLocaleString("id-ID")})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
