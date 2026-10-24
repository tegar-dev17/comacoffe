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
};

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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ orderNumber: string; totalMinor: number } | null>(
    null,
  );

  const loadProducts = useCallback(async () => {
    if (!token || !outletId) return;
    const res = await apiFetch<{ data: Product[] }>(
      `/api/v1/catalog/products?outletId=${outletId}&q=${encodeURIComponent(query)}`,
      { token },
    );
    setProducts(res.data);
  }, [token, outletId, query]);

  useEffect(() => {
    void loadProducts().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [loadProducts]);

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
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{
        data: {
          order: { id: string; orderNumber: string; totalMinor: number };
          payment: { id: string; status: string; instructions?: unknown };
        };
      }>("/api/v1/pos/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({
          outletId,
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          paymentMethod,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      setLastReceipt({
        orderNumber: res.data.order.orderNumber,
        totalMinor: res.data.order.totalMinor,
      });
      setCart([]);
      await loadProducts();
      if (paymentMethod === "qris" && res.data.payment.status !== "SUCCEEDED") {
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
          Total: <strong>{formatIdr(totalMinor)}</strong>
        </p>
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
            disabled={busy || cart.length === 0}
            onClick={() => void checkout("qris")}
          >
            Bayar QRIS
          </button>
        </div>
      </aside>
    </div>
  );
}
