import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UAT Tester · SML AI Account — ฝูงบอททดสอบ 32 ตัว",
  description: "ทดสอบระบบ ERP SML AI Account ตามสคริปต์ทีละขั้นตอน ทั้งหน้าจอ API และฐานข้อมูล PostgreSQL (Demo) ด้วยบอท 32 ตัว",
  robots: { index: false, follow: false }, // เครื่องมือภายใน ไม่เปิดให้ค้นหา
};

export const viewport: Viewport = { themeColor: "#04060f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className="dark">
      <body className="min-h-screen overflow-x-hidden antialiased">
        <div className="stage" aria-hidden>
          <div className="aurora a1" />
          <div className="aurora a2" />
          <div className="aurora a3" />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
