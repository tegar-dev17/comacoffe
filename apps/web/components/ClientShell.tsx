"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getStoredUser, getToken, type StoredUser } from "../lib/auth";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const isLogin = pathname === "/login";

  useEffect(() => {
    setUser(getStoredUser());
    const token = getToken();
    setAuthChecked(true);
    if (!token && pathname !== "/login") {
      router.replace("/login");
    }
  }, [pathname, router]);

  function logout() {
    clearSession();
    setUser(null);
    router.push("/login");
  }

  if (isLogin) {
    return <>{children}</>;
  }

  if (!authChecked) {
    return <main className="container muted">Memuat…</main>;
  }

  if (!getToken()) {
    return <main className="container muted">Mengalihkan ke login…</main>;
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">Comacoffe POS</div>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/pos">Kasir</Link>
          <Link href="/orders">Transaksi</Link>
          <Link href="/products">Produk</Link>
          <Link href="/payments">Payments</Link>
          {user ? (
            <button type="button" className="link-btn" onClick={logout}>
              Logout ({user.displayName})
            </button>
          ) : null}
        </nav>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
