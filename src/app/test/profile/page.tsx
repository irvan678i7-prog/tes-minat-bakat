import { redirect } from "next/navigation";
import { getStudentFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ProfileForm from "@/components/student/ProfileForm";

export default async function ProfilePage() {
  const me = await getStudentFromCookies();
  if (!me) redirect("/");
  const sub = await prisma.submission.findUnique({ where: { id: me.sub } });
  if (!sub) redirect("/");
  if (sub.finishedAt) redirect("/test/done");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-4 border-black bg-yellow-300">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-black uppercase">Data Diri Peserta</h1>
          <span className="brut-tag" style={{ background: "#000", color: "#fff" }}>
            TES {sub.testKind}
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
        <p className="font-semibold mb-6">
          Lengkapi data diri sebelum mengerjakan tes. Data ini akan tampil di laporan hasil yang
          dapat diunduh oleh admin/guru.
        </p>
        <ProfileForm
          initial={{
            fullName: sub.fullName || "",
            gender: sub.gender || "",
            birthPlace: sub.birthPlace || "",
            birthDate: sub.birthDate ? sub.birthDate.toISOString().slice(0, 10) : "",
            age: sub.age ?? undefined,
            grade: sub.grade || "",
            school: sub.school || "",
            major: sub.major || "",
            phone: sub.phone || "",
            email: sub.email || "",
          }}
        />
      </main>
    </div>
  );
}
