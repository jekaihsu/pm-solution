import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PM Dashboard",
  description: "Lark Base 即時專案儀表板",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
