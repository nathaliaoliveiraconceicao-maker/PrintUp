import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PrintUp — preço certo para impressão 3D", template: "%s · PrintUp" },
  description: "Calcule custo e preço de venda dos seus produtos impressos em 3D.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1c1f24" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
