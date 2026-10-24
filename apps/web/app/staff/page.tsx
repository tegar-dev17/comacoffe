"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getToken } from "@/lib/auth";

type Staff = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
};

export default function StaffPage() {
  const token = getToken();
  const [rows, setRows] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "cashier",
  });

  function load() {
    if (!token) return;
    apiFetch<{ data: Staff[] }>("/api/v1/staff", { token })
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }

  useEffect(load, [token]);

  async function create() {
    if (!token) return;
    try {
      await apiFetch("/api/v1/staff", {
        method: "POST",
        token,
        body: JSON.stringify(form),
      });
      setForm({ email: "", password: "", displayName: "", role: "cashier" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    }
  }

  return (
    <div>
      <h1>Staf</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="card stack">
        <h2>Tambah staf</h2>
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Nama" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <input type="password" placeholder="Password min 8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="cashier">Kasir</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
        </select>
        <button type="button" onClick={() => void create()}>
          Buat akun
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Role</th>
              <th>Aktif</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.displayName}</td>
                <td>{s.email}</td>
                <td>{s.role}</td>
                <td>{s.isActive ? "Ya" : "Tidak"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
