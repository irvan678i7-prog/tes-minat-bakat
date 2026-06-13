import KelasRedeem from "@/components/student/KelasRedeem";

// Landing page untuk link kelas yang dibagikan admin. URL bentuknya
// `/k/<KODE>` — frontend akan otomatis POST ke /api/student/redeem dengan
// kode dari URL, lalu redirect ke /test/profile atau /test sesuai status
// submission siswa. Render-nya client supaya cookie HttpOnly tetap di-set
// oleh response API (bukan dari server component).
export default async function KelasLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <KelasRedeem code={(code || "").toUpperCase()} />;
}
