import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { ReduxProvider } from "@/providers/ReduxProvider";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Nouris Dashboard",
  description: "Gestion des rapports Nouris El Bahr",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${archivo.variable} font-archivo`}>
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
