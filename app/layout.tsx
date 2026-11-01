import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Punch in — 作業時間の記録",
  description: "研究、個人開発、就活。あなたの時間を、ひと押しで記録。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
