import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAdminFromCookies } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = {
  // Belt & suspenders: header X-Robots-Tag di next.config.ts sudah set noindex,
  // tapi metadata ini juga menambah <meta name="robots"> di HTML head.
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getAdminFromCookies();
  if (!me) redirect("/admin/login");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/admin" className="text-xl font-black tracking-tight uppercase">
            ADMIN PANEL <span className="bg-yellow-300 text-black px-2 ml-1">TMB</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold opacity-80">{me.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto px-6 py-10 w-full">{children}</main>
    </div>
  );
}
