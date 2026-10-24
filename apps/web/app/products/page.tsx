"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { getStoredUser, getToken } from "../../lib/auth";
import { formatIdr } from "../../lib/format";

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  priceMinor: number;
  isActive: boolean;
  trackInventory: boolean;
};

export default function ProductsPage() {
  const token = getToken();
  const user = getStoredUser();
  const canManage = user?.role === "admin" || user?.role === "owner" || user?.role === "supervisor";
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [name, setName] = useState("");
  const [priceMinor, setPriceMinor] = useState(25000);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch<{ data: ProductRow[]; pagination?: { total: number } }>(
      `/api/v1/catalog/products?admin=1&page=${page}&limit=${limit}`,
      { token },
    );
    setRows(res.data);
    setTotal(res.pagination?.total ?? res.data.length);
  }, [token, page]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !canManage) return;
    await apiFetch("/api/v1/catalog/products", {
      method: "POST",
      token,
      body: JSON.stringify({ name, priceMinor }),
    });
    setName("");
    await load();
  }

  if (!canManage) {
    return <p className="muted">Hanya admin/supervisor yang dapat mengelola produk.</p>;
  }

  return (
    <div>
      <h1>Produk</h1>
      <form className="card stack" onSubmit={(e) => void onCreate(e)}>
        <h2>Tambah produk</h2>
        <label>
          Nama
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Harga (minor)
          <input
            type="number"
            value={priceMinor}
            onChange={(e) => setPriceMinor(Number(e.target.value))}
            required
          />
        </label>
        <button type="submit">Simpan</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>SKU</th>
              <th>Harga</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku ?? "—"}</td>
                <td>{formatIdr(p.priceMinor)}</td>
                <td>{p.isActive ? "Aktif" : "Nonaktif"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="filters">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Sebelumnya
        </button>
        <span className="muted">
          Halaman {page} · {total} produk
        </span>
        <button type="button" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>
          Berikutnya
        </button>
      </div>
    </div>
  );
}
