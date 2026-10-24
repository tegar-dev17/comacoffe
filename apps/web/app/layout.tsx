import type { Metadata } from "next";
import "./globals.css";
import { ClientShell } from "../components/ClientShell";

export const metadata: Metadata = {
  title: "Comacoffe POS",
  description: "Point of Sale dan payment gateway untuk kedai kopi Comacoffe",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
