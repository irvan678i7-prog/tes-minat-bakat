// src/lib/rekap-key.ts
// Util normalisasi untuk pengelompokan rekap (sekolah / kelas / jurusan).

function baseClean(raw: string | null | undefined): string {
	return String(raw ?? "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[.,'"()\-/]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// ── SEKOLAH ──────────────────────────────────────────────────────────────
// Strategi: samakan jenis sekolah ke bentuk dasar (sma/smk/smp/sd/ma/mts),
// BUANG kata "negeri"/"swasta" supaya "SMK 1" = "SMKN 1" = "SMK Negeri 1".
export function schoolKey(raw: string | null | undefined): string {
	let s = baseClean(raw);
	const rules: Array<[RegExp, string]> = [
		[/\bsekolah dasar\b|\bsdn\b/g, "sd"],
		[/\bsmk negeri\b|\bsmkn\b/g, "smk"],
		[/\bsma negeri\b|\bsman\b/g, "sma"],
		[/\bsmp negeri\b|\bsmpn\b/g, "smp"],
		[/\bmadrasah aliyah\b|\bman\b/g, "ma"],
		[/\bmadrasah tsanawiyah\b|\bmtsn\b|\bmts\b/g, "mts"],
		[/\bmadrasah ibtidaiyah\b|\bmin\b/g, "mi"],
		[/\bnegeri\b|\bneg\b/g, ""], // buang sisa kata "negeri"
		[/\bswasta\b|\bswt\b/g, ""], // buang kata "swasta"
	];
	for (const [re, to] of rules) s = s.replace(re, to);
	return s.replace(/\s+/g, " ").trim();
}

// ── KELAS ────────────────────────────────────────────────────────────────
const ROMAN_TO_NUM: Record<string, string> = {
	vii: "7",
	viii: "8",
	ix: "9",
	x: "10",
	xi: "11",
	xii: "12",
};
export function gradeKey(raw: string | null | undefined): string {
	const s = baseClean(raw).replace(/\bkelas\b/g, " ").trim();
	const first = s.split(/[\s-]+/).filter(Boolean)[0] ?? "";
	if (/^\d{1,2}$/.test(first)) {
		const n = parseInt(first, 10);
		return n >= 1 && n <= 12 ? String(n) : "";
	}
	if (ROMAN_TO_NUM[first]) return ROMAN_TO_NUM[first];
	const m = s.match(/\b(1[0-2]|[1-9])\b/);
	return m ? m[1] : "";
}

// ── JURUSAN ──────────────────────────────────────────────────────────────
export function majorKey(raw: string | null | undefined): string {
	let s = baseClean(raw);
	const rules: Array<[RegExp, string]> = [
		[/\bm ?ipa\b|\bipa\b/g, "ipa"],
		[/\bi ?is\b|\bips\b/g, "ips"],
		[/\bbahasa( dan budaya)?\b|\bbb\b/g, "bahasa"],
		[/\bpemasaran\b|\bpms\b|\bbdp\b/g, "pemasaran"],
		[/\bakuntansi\b|\bakl\b|\bakt\b/g, "akuntansi"],
		[/\b(teknik komputer( dan)? jaringan)\b|\btkj\b/g, "tkj"],
		[/\b(rekayasa perangkat lunak)\b|\brpl\b/g, "rpl"],
		[/\b(otomatisasi.*perkantoran)\b|\botkp\b|\bap\b/g, "otkp"],
	];
	for (const [re, to] of rules) s = s.replace(re, to);
	return s.replace(/\s+/g, " ").trim();
}

// ── KUNCI GABUNGAN ─────────────────────────────────────────────────────────
export function rekapKey(d: {
	school?: string | null;
	grade?: string | null;
	major?: string | null;
}): string {
	return [schoolKey(d.school), gradeKey(d.grade), majorKey(d.major)].join("|");
}

// ── PEMILIH NAMA TAMPILAN ───────────────────────────────────────────────────
export function pickDisplay(candidates: Array<string | null | undefined>): string {
	const list = candidates.map((c) => (c ?? "").trim()).filter(Boolean);
	if (list.length === 0) return "";
	return list.sort((a, b) => {
		if (b.length !== a.length) return b.length - a.length;
		const aCap = /[A-Z]/.test(a) ? 1 : 0;
		const bCap = /[A-Z]/.test(b) ? 1 : 0;
		return bCap - aCap;
	})[0];
}
