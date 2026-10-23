import Link from "next/link";

export default function HomePage() {
  return (
    <div>
      <h1>Payment Operations</h1>
      <p className="muted">
        Dashboard admin untuk monitoring transaksi QRIS, tunai, refund, dan rekonsiliasi.
      </p>
      <div className="card">
        <p>
          Buka halaman <Link href="/payments">Payments</Link> dan tempel JWT dev dari endpoint{" "}
          <code>/api/v1/dev/token</code>.
        </p>
      </div>
    </div>
  );
}
