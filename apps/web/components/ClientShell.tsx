"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getStoredUser, getToken, type StoredUser } from "../lib/auth";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const isLogin = pathname === "/login";

  useEffect(() => {
    setUser(getStoredUser());
  }, [pathname]);

  function logout() {
    clearSession();
    setUser(null);
    router.push("/login");
  }

  if (isLogin) {
    return <>{children}</>;
  }

  const token = getToken();
  if (!token && !isLogin) {
    if (typeof window !== "undefined" && pathname !== "/login") {
      router.replace("/login");
    }
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
