// Halaman publik verifikasi keaslian laporan.
// Bisa diakses dengan memindai QR di laporan PDF (/verifikasi?kode=...) atau
// dengan mengetik kode laporan secara manual.
//
// Sengaja TIDAK menampilkan skor apa pun — hanya memastikan laporan dengan kode
// tersebut benar diterbitkan oleh Program Studi Magister Bimbingan dan
// Konseling, Program Pascasarjana Universitas Muhammadiyah Metro.

import { prisma } from "../../lib/db";
import {
	LEMBAGA_PRODI,
	LEMBAGA_UNIT,
	REPORT_KIND_LABEL,
	buildReportCode,
	parseReportCode,
	type ReportKind,
} from "../../lib/report-verification";

export const dynamic = "force-dynamic";

export const metadata = {
	title: "Verifikasi Keaslian Laporan",
	description:
		"Cek keaslian laporan Tes Minat, Tes Bakat, dan Tes IQ yang diterbitkan Program Studi Magister Bimbingan dan Konseling, Pascasarjana Universitas Muhammadiyah Metro.",
};

type Status = "VALID" | "BELUM_SELESAI" | "TIDAK_DITEMUKAN" | "KODE_TIDAK_SAH";

type Hasil = {
	status: Status;
	kode: string;
	jenis?: ReportKind;
	nama?: string;
	sekolah?: string;
	kelas?: string;
	selesai?: Date | null;
};

function fmtTanggal(d?: Date | null): string {
	if (!d) return "\u2014";
	return (
		new Date(d).toLocaleString("id-ID", {
			day: "2-digit",
			month: "long",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Asia/Jakarta",
		}) + " WIB"
	);
}

// Nama disamarkan sebagian demi privasi peserta: "Ahmad Fauzi" -> "Ahmad F****".
function samarkanNama(nama: string | null | undefined): string {
	const v = String(nama ?? "").trim();
	if (!v) return "\u2014";
	const kata = v.split(/\s+/);
	return kata
		.map((w, i) =>
			i === 0 ? w : `${w.slice(0, 1)}${"*".repeat(Math.max(1, w.length - 1))}`,
		)
		.join(" ");
}

async function verifikasi(input: string): Promise<Hasil> {
	const parsed = parseReportCode(input);
	if (!parsed) {
		return { status: "KODE_TIDAK_SAH", kode: input.trim().toUpperCase() };
	}

	if (parsed.kind === "IQ") {
		const sub = await prisma.cfitSubmission.findFirst({
			where: { id: { startsWith: parsed.idPrefixDb } },
			select: {
				id: true,
				fullName: true,
				school: true,
				grade: true,
				finishedAt: true,
				result: { select: { id: true } },
			},
		});
		if (!sub) return { status: "TIDAK_DITEMUKAN", kode: parsed.code };
		// Cegah kode tabrakan: pastikan kode yang dihasilkan id ini memang sama.
		if (buildReportCode("IQ", sub.id) !== parsed.code) {
			return { status: "TIDAK_DITEMUKAN", kode: parsed.code };
		}
		return {
			status: sub.finishedAt && sub.result ? "VALID" : "BELUM_SELESAI",
			kode: parsed.code,
			jenis: "IQ",
			nama: samarkanNama(sub.fullName),
			sekolah: sub.school || "\u2014",
			kelas: sub.grade || "\u2014",
			selesai: sub.finishedAt,
		};
	}

	const sub = await prisma.submission.findFirst({
		where: { id: { startsWith: parsed.idPrefixDb }, testKind: parsed.kind },
		select: {
			id: true,
			fullName: true,
			school: true,
			grade: true,
			finishedAt: true,
			result: { select: { id: true } },
		},
	});
	if (!sub) return { status: "TIDAK_DITEMUKAN", kode: parsed.code };
	if (buildReportCode(parsed.kind, sub.id) !== parsed.code) {
		return { status: "TIDAK_DITEMUKAN", kode: parsed.code };
	}
	return {
		status: sub.finishedAt && sub.result ? "VALID" : "BELUM_SELESAI",
		kode: parsed.code,
		jenis: parsed.kind,
		nama: samarkanNama(sub.fullName),
		sekolah: sub.school || "\u2014",
		kelas: sub.grade || "\u2014",
		selesai: sub.finishedAt,
	};
}

const STATUS_STYLE: Record<Status, { bg: string; judul: string; pesan: string }> = {
	VALID: {
		bg: "#16A34A",
		judul: "LAPORAN ASLI \u2014 TERVERIFIKASI",
		pesan:
			"Kode laporan ini terdaftar dan hasil tesnya sudah final. Laporan diterbitkan secara resmi oleh penyelenggara di bawah ini.",
	},
	BELUM_SELESAI: {
		bg: "#F97316",
		judul: "KODE TERDAFTAR \u2014 HASIL BELUM FINAL",
		pesan:
			"Kode laporan ini terdaftar, tetapi pelaksanaan tesnya belum diselesaikan sehingga laporan final belum diterbitkan.",
	},
	TIDAK_DITEMUKAN: {
		bg: "#DC2626",
		judul: "KODE TIDAK DITEMUKAN",
		pesan:
			"Tidak ada laporan dengan kode ini pada basis data penyelenggara. Pastikan kode diketik dengan benar.",
	},
	KODE_TIDAK_SAH: {
		bg: "#DC2626",
		judul: "KODE TIDAK SAH",
		pesan:
			"Format kode tidak dikenali atau tanda tangan digitalnya tidak cocok. Laporan dengan kode ini TIDAK diterbitkan oleh penyelenggara.",
	},
};

export default async function VerifikasiPage({
	searchParams,
}: {
	searchParams: Promise<{ kode?: string | string[] }>;
}) {
	const sp = await searchParams;
	const raw = Array.isArray(sp?.kode) ? sp.kode[0] : (sp?.kode ?? "");
	const hasil = raw && raw.trim() ? await verifikasi(raw) : null;
	const style = hasil ? STATUS_STYLE[hasil.status] : null;

	return (
		<main className="min-h-screen bg-white text-black">
			<header className="border-b-4 border-black bg-black text-white">
				<div className="max-w-3xl mx-auto px-6 py-5">
					<h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
						Verifikasi Keaslian Laporan
					</h1>
					<p className="text-sm font-semibold opacity-80 mt-1">
						Tes Minat \u2022 Tes Bakat \u2022 Tes IQ (CFIT Skala 3)
					</p>
				</div>
			</header>

			<div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
				<section className="border-4 border-black p-5">
					<p className="text-sm font-semibold mb-3">
						Pindai QR code pada laporan, atau ketik kode laporan yang tertera di
						sudut kanan atas laporan.
					</p>
					<form method="get" action="/verifikasi" className="flex flex-wrap gap-3">
						<input
							type="text"
							name="kode"
							defaultValue={raw}
							placeholder="UMM-BKT-XXXXXXXX-XXXX"
							autoComplete="off"
							className="flex-1 min-w-[240px] border-4 border-black px-4 py-3 font-mono font-bold uppercase tracking-wider"
						/>
						<button
							type="submit"
							className="border-4 border-black bg-yellow-300 px-6 py-3 font-black uppercase tracking-wide"
						>
							Periksa
						</button>
					</form>
				</section>

				{hasil && style ? (
					<section className="border-4 border-black">
						<div
							className="px-5 py-4 text-white"
							style={{ background: style.bg }}
						>
							<p className="text-lg font-black uppercase tracking-tight">
								{style.judul}
							</p>
							<p className="font-mono font-bold text-sm mt-1">{hasil.kode}</p>
						</div>
						<div className="px-5 py-4 space-y-4">
							<p className="text-sm font-semibold">{style.pesan}</p>

							{hasil.jenis ? (
								<table className="w-full text-sm">
									<tbody>
										<tr className="border-b-2 border-black/10">
											<td className="py-2 pr-4 font-bold opacity-60 w-40">
												Jenis Laporan
											</td>
											<td className="py-2 font-bold">
												{REPORT_KIND_LABEL[hasil.jenis]}
											</td>
										</tr>
										<tr className="border-b-2 border-black/10">
											<td className="py-2 pr-4 font-bold opacity-60">Nama Peserta</td>
											<td className="py-2 font-bold">{hasil.nama}</td>
										</tr>
										<tr className="border-b-2 border-black/10">
											<td className="py-2 pr-4 font-bold opacity-60">Sekolah</td>
											<td className="py-2 font-bold">{hasil.sekolah}</td>
										</tr>
										<tr className="border-b-2 border-black/10">
											<td className="py-2 pr-4 font-bold opacity-60">Kelas</td>
											<td className="py-2 font-bold">{hasil.kelas}</td>
										</tr>
										<tr>
											<td className="py-2 pr-4 font-bold opacity-60">
												Waktu Selesai
											</td>
											<td className="py-2 font-bold">{fmtTanggal(hasil.selesai)}</td>
										</tr>
									</tbody>
								</table>
							) : null}

							<p className="text-xs font-semibold opacity-60">
								Nama peserta sengaja disamarkan sebagian demi menjaga kerahasiaan
								data. Halaman ini tidak menampilkan skor hasil tes.
							</p>
						</div>
					</section>
				) : null}

				<section className="border-4 border-black bg-yellow-300 p-5">
					<p className="text-xs font-black uppercase tracking-wide mb-1">
						Penyelenggara Tes
					</p>
					<p className="font-black leading-snug">{LEMBAGA_PRODI}</p>
					<p className="font-bold leading-snug">{LEMBAGA_UNIT}</p>
				</section>
			</div>
		</main>
	);
}
