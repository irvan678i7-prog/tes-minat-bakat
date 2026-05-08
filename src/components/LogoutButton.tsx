"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await fetch("/api/admin/logout", { method: "POST" });
          router.push("/admin/login");
          router.refresh();
        })
      }
      className="brut-btn brut-btn-pink text-xs"
      disabled={pending}
    >
      KELUAR
    </button>
  );
}
