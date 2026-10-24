"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getToken } from "@/lib/auth";

type Settings = {
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
  receiptFooter?: string | null;
  taxRateBps: number;
  serviceChargeBps: number;
  requireOpenShift: boolean;
};

export default function SettingsPage() {
  const token = getToken();
  const [form, setForm] = useState<Settings>({
    taxRateBps: 0,
    serviceChargeBps: 0,
    requireOpenShift: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ data: Settings }>("/api/v1/settings", { token })
      .then((r) => setForm((f) => ({ ...f, ...r.data })))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [token]);

  async function save() {
    if (!token) return;
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/api/v1/settings", {
        method: "PUT",
        token,
        body: JSON.stringify(form),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    }
  }

  return (
    <div>
      <h1>Pengaturan toko</h1>
      <div className="card stack">
        <label>
          Nama bisnis
          <input
            value={form.businessName ?? ""}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
        </label>
        <label>
          Alamat
          <textarea
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label>
          Footer struk
          <input
            value={form.receiptFooter ?? ""}
            onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
          />
        </label>
        <label>
          Pajak (basis poin, 1000 = 10%)
          <input
            type="number"
            value={form.taxRateBps}
            onChange={(e) => setForm({ ...form, taxRateBps: Number(e.target.value) })}
          />
        </label>
        <label>
          Service charge (basis poin)
          <input
            type="number"
            value={form.serviceChargeBps}
            onChange={(e) => setForm({ ...form, serviceChargeBps: Number(e.target.value) })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.requireOpenShift}
            onChange={(e) => setForm({ ...form, requireOpenShift: e.target.checked })}
          />{" "}
          Wajib buka shift sebelum checkout
        </label>
        <button type="button" onClick={() => void save()}>
          Simpan
        </button>
        {saved ? <p className="success">Tersimpan</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
