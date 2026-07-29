"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import toast from "react-hot-toast";

// Usia dihitung otomatis dari tanggal lahir terhadap TANGGAL TES
// (tanggal token di-redeem), bukan diketik manual.
function computeAge(birthDate: string, ref: Date): number | null {
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  if (age < 0 || age > 130) return null;
  return age;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CfitProfilePage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [nis, setNis] = useState("");
  const [gender, setGender] = useState<"" | "L" | "P">("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [testDate, setTestDate] = useState<Date | null>(null);
  // Alert setelah biodata tersimpan: peserta TIDAK boleh mulai tes sebelum
  // ada pengarahan dari tester.
  const [briefing, setBriefing] = useState(false);

  // Ambil tanggal tes (waktu token di-redeem) + prefill kalau sudah pernah isi.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/cfit/profile");
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.status === 401) {
        toast.error("Sesi berakhir. Masukkan token lagi.");
        router.replace("/cfit");
        return;
      }
      if (res.ok) {
        if (data.fullName) setFullName(String(data.fullName));
        if (data.nis) setNis(String(data.nis));
        if (data.gender === "L" || data.gender === "P") setGender(data.gender);
        if (data.school) setSchool(String(data.school));
        if (data.grade) setGrade(String(data.grade));
        if (data.birthDate) setBirthDate(String(data.birthDate).slice(0, 10));
        setTestDate(data.testDate ? new Date(data.testDate) : new Date());
      } else {
        setTestDate(new Date());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const age = useMemo(
    () => (birthDate && testDate ? computeAge(birthDate, testDate) : null),
    [birthDate, testDate],
  );

  const testDateLabel = testDate
    ? testDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "—";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return void toast.error("Nama lengkap wajib diisi");
    if (!gender) return void toast.error("Pilih jenis kelamin");
    if (!school.trim()) return void toast.error("Sekolah asal wajib diisi");
    if (!birthDate) return void toast.error("Tanggal lahir wajib diisi");
    if (age == null || age < 5 || age > 99) return void toast.error("Tanggal lahir tidak valid");
    startTransition(async () => {
      const res = await fetch("/api/cfit/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          nis: nis.trim() || undefined,
          gender,
          school: school.trim(),
          grade: grade.trim() || undefined,
          birthDate,
          age,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.error("Sesi berakhir. Masukkan token lagi.");
        router.replace("/cfit");
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Gagal menyimpan biodata");
        return;
      }
      if (data.normWarning) toast(data.normWarning, { icon: "⚠️", duration: 6000 });
      toast.success("Biodata tersimpan!");
      setBriefing(true);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="brut-card font-black uppercase brut-blink">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-cyan-300">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-black uppercase">Data Diri Peserta</h1>
          <p className="text-xs font-bold uppercase tracking-wider mt-0.5">Tes IQ — CFIT Skala 3</p>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
        <form onSubmit={submit} className="brut-card space-y-4" style={{ background: "#fff" }}>
          <div>
            <label className="block text-sm font-black uppercase mb-1">Nama Lengkap *</label>
            <input
              className="brut-input w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-black uppercase mb-1">NIS</label>
            <input
              className="brut-input w-full"
              placeholder="Nomor Induk Siswa"
              value={nis}
              onChange={(e) => setNis(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
            <p className="text-xs font-semibold mt-1">Dicetak di identitas laporan, di bawah nama.</p>
          </div>

          <div>
            <label className="block text-sm font-black uppercase mb-1">Jenis Kelamin *</label>
            <select
              className="brut-input w-full"
              value={gender}
              onChange={(e) => setGender(e.target.value as "" | "L" | "P")}
              disabled={pending}
            >
              <option value="">— PILIH —</option>
              <option value="L">LAKI-LAKI</option>
              <option value="P">PEREMPUAN</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-black uppercase mb-1">Sekolah Asal *</label>
            <input
              className="brut-input w-full"
              placeholder="cth: SMA Negeri 1 Bandung"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-black uppercase mb-1">Tanggal Tes</label>
              <input className="brut-input w-full" value={testDateLabel} readOnly style={{ background: "#f3f4f6" }} />
              <p className="text-xs font-semibold mt-1">Otomatis — sesuai tanggal token dipakai.</p>
            </div>
            <div>
              <label className="block text-sm font-black uppercase mb-1">Tanggal Lahir *</label>
              <input
                type="date"
                className="brut-input w-full"
                value={birthDate}
                max={testDate ? toDateInputValue(testDate) : undefined}
                onChange={(e) => setBirthDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-black uppercase mb-1">Usia (tahun)</label>
              <input
                className="brut-input w-full"
                value={age != null ? `${age} tahun` : ""}
                placeholder="Otomatis dari tanggal lahir"
                readOnly
                style={{ background: "#f3f4f6" }}
              />
              <p className="text-xs font-semibold mt-1">
                Dihitung otomatis. Norma IQ saat ini untuk usia 17+.
                {age != null && age < 17 ? " ⚠️ Usia di bawah 17 tahun." : ""}
              </p>
            </div>
            <div>
              <label className="block text-sm font-black uppercase mb-1">Kelas (opsional)</label>
              <input
                className="brut-input w-full"
                placeholder="cth: XII TKJ 1"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                disabled={pending}
              />
              <p className="text-xs font-semibold mt-1">Dipakai untuk filter rekap per kelas.</p>
            </div>
          </div>

          <button type="submit" className="brut-btn brut-btn-cyan w-full" disabled={pending}>
            {pending ? "MENYIMPAN..." : "SIMPAN & LANJUT"}
          </button>
        </form>
      </main>

      {briefing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: "rgba(0,0,0,0.75)" }}
          role="dialog"
          aria-modal="true"
        >
          <div className="brut-card w-full max-w-lg space-y-4" style={{ background: "#fef08a" }}>
            <h2 className="text-2xl font-black uppercase leading-tight">
              ⚠️ Jangan mulai tes dulu!
            </h2>
            <p className="font-bold">
              Biodata kamu sudah tersimpan. JANGAN MEMULAI TES SEBELUM ADA PENGARAHAN DARI TESTER.
            </p>
            <p className="text-sm font-semibold">
              Tunggu di halaman daftar subtes dan dengarkan instruksi tester. Begitu subtes pertama
              dimulai, waktu langsung berjalan dan tidak bisa dihentikan.
            </p>
            <button
              type="button"
              className="brut-btn brut-btn-black w-full"
              onClick={() => router.push("/cfit/test")}
            >
              SAYA MENGERTI, TUNGGU PENGARAHAN TESTER
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
