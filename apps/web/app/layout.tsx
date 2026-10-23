import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comacoffe — Payment Admin",
  description: "Payment management dashboard for Comacoffe POS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="topbar">
          <div className="brand">Comacoffe POS</div>
          <nav>
            <Link href="/">Dashboard</Link>
            <Link href="/payments">Payments</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
