"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import { getToken } from "../../../lib/auth";
import { formatDateTimeId, formatIdr } from "../../../lib/format";

type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  totalMinor: number;
  paidAt: string | null;
  createdAt: string;
  items: Array<{
    productName: string;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
  }>;
  payments: Array<{ paymentMethod: string; status: string; amountMinor: number }>;
};

export default function OrderReceiptPage() {
  const params = useParams<{ orderId: string }>();
  const token = getToken();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !params.orderId) return;
    apiFetch<{ data: OrderDetail }>(`/api/v1/orders/${params.orderId}`, { token })
      .then((res) => setOrder(res.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [token, params.orderId]);

  function printReceipt() {
    window.print();
  }

  if (error) return <p className="error">{error}</p>;
  if (!order) return <p className="muted">Memuat struk…</p>;

  return (
    <div className="receipt card">
      <h1>Struk Comacoffe</h1>
      <p className="muted">{order.orderNumber}</p>
      <p>{formatDateTimeId(order.paidAt ?? order.createdAt)}</p>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i, idx) => (
            <tr key={idx}>
              <td>{i.productName}</td>
              <td>{i.quantity}</td>
              <td>{formatIdr(i.lineTotalMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cart-total">Total: {formatIdr(order.totalMinor)}</p>
      <p className="muted">
        Pembayaran:{" "}
        {order.payments.map((p) => `${p.paymentMethod} (${p.status})`).join(", ") || "—"}
      </p>
      <button type="button" onClick={printReceipt}>
        Cetak
      </button>
    </div>
  );
}
