"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getStoredUser, getToken } from "@/lib/auth";

type Movement = {
  id: string;
  productId: string;
  delta: number;
  reason: string;
  createdAt: string;
};

type Product = { id: string; name: string; sku: string | null };

export default function InventoryPage() {
  const token = getToken();
  const user = getStoredUser();
  const outletId = user?.outletId ?? "";
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("Stok masuk");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !outletId) return;
    const [mov, prod] = await Promise.all([
      apiFetch<{ data: Movement[] }>(
        `/api/v1/catalog/inventory/movements?outletId=${outletId}&limit=50`,
        { token },
      ),
      apiFetch<{ data: Product[] }>(`/api/v1/catalog/products?outletId=${outletId}`, { token }),
    ]);
    setMovements(mov.data);
    setProducts(prod.data);
    if (!productId && prod.data[0]) setProductId(prod.data[0].id);
  }, [token, outletId]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [load]);

  async function adjust() {
    if (!token || !outletId || !productId) return;
    setError(null);
    setMsg(null);
    try {
      await apiFetch("/api/v1/catalog/inventory/adjust", {
        method: "POST",
        token,
        body: JSON.stringify({ outletId, productId, delta, reason }),
      });
      setMsg("Stok diperbarui");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    }
  }

  if (!outletId) {
    return <p className="error">Login dengan outlet (kasir/admin outlet) untuk inventori.</p>;
  }

  return (
    <div>
      <h1>Inventori</h1>
      <div className="card stack">
        <h2>Penyesuaian stok</h2>
        <label>
          Produk
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Delta (+/-)
          <input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
        </label>
        <label>
          Alasan
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="button" onClick={() => void adjust()}>
          Simpan penyesuaian
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="success">{msg}</p> : null}
      <div className="card">
        <h2>Riwayat pergerakan</h2>
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Produk</th>
              <th>Delta</th>
              <th>Alasan</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.createdAt).toLocaleString("id-ID")}</td>
                <td>{products.find((p) => p.id === m.productId)?.name ?? m.productId.slice(0, 8)}</td>
                <td>{m.delta}</td>
                <td>{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
