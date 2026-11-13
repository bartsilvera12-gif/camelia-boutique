import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Camélia Boutique — Moda con alma Art Nouveau",
  description:
    "Boutique online de moda femenina. Sacos, suéteres, remeras, bufandas y accesorios seleccionados a mano.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
