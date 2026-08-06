// Halaman publik verifikasi keaslian laporan.
// Bisa diakses dengan memindai QR di laporan PDF (/verifikasi?kode=...) atau
// dengan mengetik kode laporan secara manual.
//
// Sengaja MINIM data: hanya jenis laporan dan nama peserta yang disamarkan.
// Tujuannya semata memastikan laporan dengan kode tersebut benar diterbitkan
// oleh Program Studi Magister Bimbingan dan Konseling, Program Pascasarjana
// Universitas Muhammadiyah Metro.

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
};

// Nama disamarkan demi privasi peserta: SEMUA kata hanya ditampilkan huruf
// pertamanya, sisanya diganti tanda bintang sebanyak jumlah huruf yang ditutup.
// Contoh: "Muhammad irvan" -> "M******* I****".
function samarkanNama(nama: string | null | undefined): string {
	const v = String(nama ?? "").trim();
	if (!v) return "\u2014";
	return v
		.split(/\s+/)
		.map(
			(w) =>
				`${w.slice(0, 1).toUpperCase()}${"*".repeat(Math.max(1, w.length - 1))}`,
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
		};
	}

	const sub = await prisma.submission.findFirst({
		where: { id: { startsWith: parsed.idPrefixDb }, testKind: parsed.kind },
		select: {
			id: true,
			fullName: true,
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
	};
}

const STATUS_STYLE: Record<
	Status,
	{ bg: string; tanda: string; judul: string; pesan: string }
> = {
	VALID: {
		bg: "#16A34A",
		tanda: "\u2713",
		judul: "Laporan Asli \u2014 Terverifikasi",
		pesan:
			"Kode laporan ini terdaftar dan hasil tesnya sudah final. Laporan diterbitkan secara resmi oleh penyelenggara di bawah ini.",
	},
	BELUM_SELESAI: {
		bg: "#F97316",
		tanda: "!",
		judul: "Kode Terdaftar \u2014 Hasil Belum Final",
		pesan:
			"Kode laporan ini terdaftar, tetapi pelaksanaan tesnya belum diselesaikan sehingga laporan final belum diterbitkan.",
	},
	TIDAK_DITEMUKAN: {
		bg: "#DC2626",
		tanda: "\u2715",
		judul: "Kode Tidak Ditemukan",
		pesan:
			"Tidak ada laporan dengan kode ini pada basis data penyelenggara. Pastikan kode diketik dengan benar.",
	},
	KODE_TIDAK_SAH: {
		bg: "#DC2626",
		tanda: "\u2715",
		judul: "Kode Tidak Sah",
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
		<main className="min-h-screen bg-neutral-100 text-black">
			<header className="border-b-4 border-black bg-black text-white">
				<div className="max-w-2xl mx-auto px-6 py-7">
					<p className="text-[11px] font-black uppercase tracking-[0.2em] text-yellow-300">
						Layanan Verifikasi Resmi
					</p>
					<h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight mt-2">
						Verifikasi Keaslian Laporan
					</h1>
					<p className="text-sm font-semibold opacity-70 mt-2 leading-snug">
						Tes Minat • Tes Bakat • Tes IQ (CFIT Skala 3)
					</p>
				</div>
			</header>

			<div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
				<section className="border-4 border-black bg-white p-6 shadow-[6px_6px_0_0_#000]">
					<h2 className="text-xs font-black uppercase tracking-[0.16em] mb-2">
						Masukkan Kode Laporan
					</h2>
					<p className="text-sm font-medium leading-relaxed opacity-70 mb-4">
						Pindai QR code pada laporan, atau ketik kode laporan yang tertera di
						sudut kanan atas dokumen.
					</p>
					<form
						method="get"
						action="/verifikasi"
						className="flex flex-col sm:flex-row gap-3"
					>
						<input
							type="text"
							name="kode"
							defaultValue={raw}
							placeholder="UMM-BKT-XXXXXXXX-XXXX"
							autoComplete="off"
							spellCheck={false}
							className="flex-1 min-w-0 border-4 border-black px-4 py-3 font-mono text-sm font-bold uppercase tracking-[0.12em] placeholder:tracking-normal placeholder:opacity-40 focus:outline-none focus:bg-yellow-50"
						/>
						<button
							type="submit"
							className="border-4 border-black bg-yellow-300 px-7 py-3 font-black uppercase tracking-wide hover:bg-yellow-400 transition-colors"
						>
							Periksa
						</button>
					</form>
				</section>

				{hasil && style ? (
					<section className="border-4 border-black bg-white shadow-[6px_6px_0_0_#000]">
						<div
							className="flex items-start gap-4 px-6 py-5 text-white"
							style={{ background: style.bg }}
						>
							<span
								aria-hidden="true"
								className="shrink-0 w-10 h-10 border-2 border-white/70 flex items-center justify-center text-xl font-black"
							>
								{style.tanda}
							</span>
							<div className="min-w-0">
								<p className="text-lg font-black uppercase tracking-tight leading-tight">
									{style.judul}
								</p>
								<p className="font-mono text-sm font-bold tracking-[0.12em] mt-1 break-all opacity-90">
									{hasil.kode}
								</p>
							</div>
						</div>

						<div className="px-6 py-5 space-y-5">
							<p className="text-sm font-medium leading-relaxed">{style.pesan}</p>

							{hasil.jenis ? (
								<dl className="border-t-2 border-black/10">
									<div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b-2 border-black/10">
										<dt className="sm:w-40 shrink-0 text-[11px] font-black uppercase tracking-[0.14em] opacity-50">
											Jenis Laporan
										</dt>
										<dd className="font-bold">{REPORT_KIND_LABEL[hasil.jenis]}</dd>
									</div>
									<div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b-2 border-black/10">
										<dt className="sm:w-40 shrink-0 text-[11px] font-black uppercase tracking-[0.14em] opacity-50">
											Nama Peserta
										</dt>
										<dd className="font-bold font-mono tracking-[0.06em]">
											{hasil.nama}
										</dd>
									</div>
								</dl>
							) : null}

							<p className="text-xs font-medium leading-relaxed opacity-55">
								Demi menjaga kerahasiaan data peserta, nama hanya ditampilkan
								huruf pertama tiap katanya. Halaman ini tidak menampilkan skor
								hasil tes.
							</p>
						</div>
					</section>
				) : null}

				<section className="border-4 border-black bg-yellow-300 p-6 shadow-[6px_6px_0_0_#000]">
					<p className="text-[11px] font-black uppercase tracking-[0.16em] mb-2">
						Penyelenggara Tes
					</p>
					<p className="font-black leading-snug">{LEMBAGA_PRODI}</p>
					<p className="font-bold leading-snug mt-0.5">{LEMBAGA_UNIT}</p>
				</section>
			</div>
		</main>
	);
}
