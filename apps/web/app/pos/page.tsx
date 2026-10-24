"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { getStoredUser, getToken } from "../../lib/auth";
import { formatIdr } from "../../lib/format";

type Product = {
  id: string;
  name: string;
  priceMinor: number;
  quantityOnHand: number;
  trackInventory: boolean;
  categoryId?: string | null;
};

type Category = { id: string; name: string };

type CartLine = { productId: string; name: string; priceMinor: number; quantity: number };

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function PosPage() {
  const user = getStoredUser();
  const token = getToken();
  const outletId = user?.outletId ?? "";
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cashReceived, setCashReceived] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ orderNumber: string; totalMinor: number } | null>(
    null,
  );
  const [capabilities, setCapabilities] = useState<{
    cash: boolean;
    qris: boolean;
    qrisDevMock?: boolean;
    qrisHint?: string;
  } | null>(null);

  const loadProducts = useCallback(async () => {
    if (!token || !outletId) return;
    const params = new URLSearchParams({ outletId });
    if (query.trim()) params.set("q", query.trim());
    if (categoryId) params.set("categoryId", categoryId);
    const res = await apiFetch<{ data: Product[] }>(
      `/api/v1/catalog/products?${params.toString()}`,
      { token },
    );
    setProducts(res.data);
  }, [token, outletId, query, categoryId]);

  async function lookupBarcode() {
    if (!token || !outletId || !barcode.trim()) return;
    const params = new URLSearchParams({ outletId, barcode: barcode.trim() });
    const res = await apiFetch<{ data: Product[] }>(
      `/api/v1/catalog/products?${params.toString()}`,
      { token },
    );
    if (res.data[0]) addToCart(res.data[0]);
    else setError("Produk barcode tidak ditemukan");
    setBarcode("");
  }

  useEffect(() => {
    void loadProducts().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [loadProducts]);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: Category[] }>("/api/v1/catalog/categories", { token })
      .then((r) => setCategories(r.data))
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: { cash: boolean; qris: boolean; qrisDevMock?: boolean; qrisHint?: string } }>(
      "/api/v1/pos/capabilities",
      { token },
    )
      .then((res) => setCapabilities(res.data))
      .catch(() => setCapabilities({ cash: true, qris: false, qrisHint: "Tidak dapat memuat konfigurasi QRIS." }));
  }, [token]);

  const totalMinor = useMemo(
    () => cart.reduce((s, l) => s + l.priceMinor * l.quantity, 0),
    [cart],
  );

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { productId: p.id, name: p.name, priceMinor: p.priceMinor, quantity: 1 }];
    });
  }

  function setQty(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  }

  async function checkout(paymentMethod: "cash" | "qris") {
    if (!token || !outletId || cart.length === 0) return;
    let receivedMinor: number | undefined;
    if (paymentMethod === "cash") {
      const parsed =
        cashReceived === "" ? totalMinor : Number(cashReceived);
      if (!Number.isFinite(parsed) || parsed < totalMinor) {
        setError("Nominal tunai diterima harus ≥ total");
        return;
      }
      receivedMinor = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        data: {
          order: { id: string; orderNumber: string; totalMinor: number };
          payment: {
            id: string;
            status: string;
            instructions?: { changeMinor?: number; cashAmountReceivedMinor?: number };
          };
        };
      }>("/api/v1/pos/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({
          outletId,
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          paymentMethod,
          idempotencyKey: newIdempotencyKey(),
          cashAmountReceivedMinor: receivedMinor,
        }),
      });
      const change = res.data.payment.instructions?.changeMinor;
      setLastReceipt({
        orderNumber: res.data.order.orderNumber,
        totalMinor: res.data.order.totalMinor,
      });
      if (paymentMethod === "cash" && change != null && change > 0) {
        setError(null);
        alert(`Kembalian: ${formatIdr(change)}`);
      }
      setCart([]);
      setCashReceived("");
      await loadProducts();
      if (paymentMethod === "qris") {
        window.location.href = `/payments/${res.data.payment.id}`;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  if (!outletId) {
    return (
      <p className="error">
        Akun ini tidak terikat outlet. Login sebagai kasir atau pilih outlet di profil.
      </p>
    );
  }

  return (
    <div className="pos-layout">
      <section className="pos-catalog">
        <div className="filters">
          <input
            placeholder="Cari produk…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <input
            placeholder="Scan barcode…"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookupBarcode();
            }}
          />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadProducts()}>
            Refresh
          </button>
        </div>
        <div className="product-grid">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              className="product-tile"
              onClick={() => addToCart(p)}
            >
              <strong>{p.name}</strong>
              <span>{formatIdr(p.priceMinor)}</span>
              {p.trackInventory ? (
                <span className="muted">Stok: {p.quantityOnHand}</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      <aside className="pos-cart card">
        <h2>Keranjang</h2>
        {cart.length === 0 ? <p className="muted">Belum ada item.</p> : null}
        <ul className="cart-list">
          {cart.map((l) => (
            <li key={l.productId}>
              <div>
                <strong>{l.name}</strong>
                <div className="muted">{formatIdr(l.priceMinor)}</div>
              </div>
              <div className="qty-controls">
                <button type="button" onClick={() => setQty(l.productId, l.quantity - 1)}>
                  −
                </button>
                <span>{l.quantity}</span>
                <button type="button" onClick={() => setQty(l.productId, l.quantity + 1)}>
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="cart-total">
          Subtotal: <strong>{formatIdr(totalMinor)}</strong>
        </p>
        <label>
          Tunai diterima (kosongkan = pas)
          <input
            type="number"
            min={0}
            value={cashReceived}
            onChange={(e) =>
              setCashReceived(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </label>
        <button type="button" className="secondary" disabled={cart.length === 0} onClick={() => setCart([])}>
          Kosongkan keranjang
        </button>
        {capabilities?.qrisHint ? <p className="muted pos-hint">{capabilities.qrisHint}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {lastReceipt ? (
          <p className="success">
            Transaksi {lastReceipt.orderNumber} — {formatIdr(lastReceipt.totalMinor)}
          </p>
        ) : null}
        <div className="stack">
          <button type="button" disabled={busy || cart.length === 0} onClick={() => void checkout("cash")}>
            Bayar Tunai
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || cart.length === 0 || capabilities?.qris === false}
            title={capabilities?.qris === false ? capabilities.qrisHint : undefined}
            onClick={() => void checkout("qris")}
          >
            {capabilities?.qrisDevMock ? "Bayar QRIS (dev mock)" : "Bayar QRIS"}
          </button>
        </div>
      </aside>
    </div>
  );
}
