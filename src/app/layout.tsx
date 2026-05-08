import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const sansFont = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TES MINAT & BAKAT — SMK",
  description: "Aplikasi tes minat & bakat untuk SMK. Brutalism UI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-sans), Arial, sans-serif" }}>
        {children}
        <Toaster
          toastOptions={{
            style: {
              border: "3px solid #000",
              boxShadow: "5px 5px 0 0 #000",
              borderRadius: 0,
              fontWeight: 700,
              background: "#fff",
              color: "#000",
            },
          }}
        />
      </body>
    </html>
  );
}
