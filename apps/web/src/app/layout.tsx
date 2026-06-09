import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { CloudSyncInit } from "@/components/layout/CloudSyncInit";
import { I18nProvider } from "@/i18n/I18nProvider";

export const metadata: Metadata = {
  title: "Nöbet Çizelgesi | Duty Schedule",
  description: "Nöbet çizelgesi hazırlama sistemi / Duty scheduling system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <I18nProvider>
          <CloudSyncInit />
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              <div className="p-6 max-w-7xl mx-auto">{children}</div>
            </main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
