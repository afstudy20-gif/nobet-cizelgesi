import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { CloudSyncInit } from "@/components/layout/CloudSyncInit";

export const metadata: Metadata = {
  title: "Nöbet Çizelgesi",
  description: "Nöbet çizelgesi hazırlama sistemi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <CloudSyncInit />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
