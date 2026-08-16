import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PCAARB — Gestão para o seu varejo",
  description: "SaaS de gestão empresarial com PDV para pequeno e médio varejo.",
};

// Tipagem simples em vez de `LayoutProps<"/">`: esse tipo só existe depois de
// um `next build`/`next dev` gerar `.next/types` — em CI/checkout limpo o
// typecheck roda antes do build e quebraria por depender de codegen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
