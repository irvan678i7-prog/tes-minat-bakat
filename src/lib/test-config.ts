// Test configuration based on the SMK Bakat & Minat book.
// All durations are admin-configurable in DB (Subtest.durationSec); these are seed defaults.

export type SubtestSeed = {
  code: string;
  testKind: "BAKAT" | "MINAT";
  name: string;
  description: string;
  durationSec: number;
  orderIndex: number;
  expectedQuestions: number;
  parts: 1 | 2 | 3;
  optionLabels: string[]; // labels used for options (multi-choice keys)
};

export const BAKAT_SUBTESTS: SubtestSeed[] = [
  {
    code: "BAKAT_1_VISUAL",
    testKind: "BAKAT",
    name: "Penalaran Visual",
    description:
      "Mengukur kecerdasan alami / bawaan. Pilih gambar yang berbeda atau yang melanjutkan deret.",
    durationSec: 6 * 60,
    orderIndex: 1,
    expectedQuestions: 25,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E"],
  },
  {
    code: "BAKAT_2_NUMERIK",
    testKind: "BAKAT",
    name: "Penalaran Numerik",
    description: "Tes potensi matematika; menemukan pola angka.",
    durationSec: 6 * 60,
    orderIndex: 2,
    expectedQuestions: 20,
    parts: 1,
    optionLabels: [],
  },
  {
    code: "BAKAT_3_VERBAL",
    testKind: "BAKAT",
    name: "Analisa Verbal",
    description: "Menggambarkan kesimpulan masuk akal dari informasi yang diberikan.",
    durationSec: 8 * 60,
    orderIndex: 3,
    expectedQuestions: 25,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F"],
  },
  {
    code: "BAKAT_4_URUTAN",
    testKind: "BAKAT",
    name: "Penalaran Urutan",
    description: "Mengisi 2 bentuk yang hilang dari deret gambar.",
    durationSec: 7 * 60,
    orderIndex: 4,
    expectedQuestions: 20,
    parts: 2,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
  },
  {
    code: "BAKAT_5_SPASIAL",
    testKind: "BAKAT",
    name: "Pengenalan Spasial",
    description: "Memutar objek 2D — tentukan apakah pilihan serupa (B) atau berbeda (S).",
    durationSec: 10 * 60,
    orderIndex: 5,
    expectedQuestions: 70,
    parts: 1,
    optionLabels: ["B", "S"],
  },
  {
    code: "BAKAT_6_3DIMENSI",
    testKind: "BAKAT",
    name: "Tiga Dimensi",
    description:
      "Membayangkan sisi tersembunyi dari tumpukan balok — 3 sisi (I, II, III) per soal.",
    durationSec: 8 * 60,
    orderIndex: 6,
    expectedQuestions: 10,
    parts: 3,
    optionLabels: ["A", "B", "C", "D", "E"],
  },
  {
    code: "BAKAT_7_SISTEMATISASI",
    testKind: "BAKAT",
    name: "Sistematisasi",
    description: "Tes klerikal cepat; pasangkan simbol dengan huruf.",
    durationSec: 4 * 60,
    orderIndex: 7,
    expectedQuestions: 150,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X"],
  },
  {
    code: "BAKAT_8_KOSAKATA",
    testKind: "BAKAT",
    name: "Kosa Kata",
    description: "Pilih kata yang paling dekat artinya.",
    durationSec: 8 * 60,
    orderIndex: 8,
    expectedQuestions: 30,
    parts: 1,
    optionLabels: ["A", "B", "C", "D"],
  },
  {
    code: "BAKAT_9_FIGURAL",
    testKind: "BAKAT",
    name: "Figural Angka",
    description: "Aritmatika cepat: desimal, persen, pembagian. Tanpa kalkulator.",
    durationSec: 7 * 60,
    orderIndex: 9,
    expectedQuestions: 25,
    parts: 1,
    optionLabels: [],
  },
];

export const MINAT_SUBTESTS: SubtestSeed[] = [
  {
    code: "MINAT_BIDANG",
    testKind: "MINAT",
    name: "Bidang Minat",
    description:
      "28 soal berpasangan. Pilih kata yang paling Anda sukai dari setiap pasangan.",
    durationSec: 30 * 60,
    orderIndex: 1,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_A",
    testKind: "MINAT",
    name: "Program A — Komunikasi",
    description: "Komunikasi (TKI, Telekomunikasi, Broadcasting, Elektronika).",
    durationSec: 30 * 60,
    orderIndex: 2,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_B",
    testKind: "MINAT",
    name: "Program B — Seni",
    description: "Seni Rupa, Kriya, Musik, Tari, Pedalangan, Karawitan, Teater.",
    durationSec: 30 * 60,
    orderIndex: 3,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_C",
    testKind: "MINAT",
    name: "Program C — Kesehatan & Pekerja Sosial",
    description: "Perawat, Dokter, Apoteker, Farmasi, Sosial, Psikologi.",
    durationSec: 30 * 60,
    orderIndex: 4,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_D",
    testKind: "MINAT",
    name: "Program D — Pariwisata",
    description: "Kepariwisataan, Tata Boga, Tata Kecantikan, Tata Busana.",
    durationSec: 30 * 60,
    orderIndex: 5,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_E",
    testKind: "MINAT",
    name: "Program E — Administrasi & Niaga",
    description: "Administrasi, Keuangan, Tata Niaga.",
    durationSec: 30 * 60,
    orderIndex: 6,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_F",
    testKind: "MINAT",
    name: "Program F — Teknologi & Konstruksi",
    description:
      "Energi Terbarukan, Geologi, Pesawat Udara, Geomatika, Bangunan, Furniture, Plambing, Listrik, Perminyakan, Grafika.",
    durationSec: 30 * 60,
    orderIndex: 7,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  },
  {
    code: "MINAT_PROG_G",
    testKind: "MINAT",
    name: "Program G — Agrobisnis",
    description: "Agrobisnis Tanaman, Ternak, Hewan, Perikanan, Pertanian, Kehutanan.",
    durationSec: 30 * 60,
    orderIndex: 8,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H"],
  },
  {
    code: "MINAT_PROG_H",
    testKind: "MINAT",
    name: "Program H — Teknik Industri & Maritim",
    description:
      "Teknik Mesin, Instrumentasi, Industri, Perkapalan, Tangkap Ikan, Budidaya, Tekstil, Pelayaran, Otomotif, Kimia.",
    durationSec: 30 * 60,
    orderIndex: 9,
    expectedQuestions: 28,
    parts: 1,
    optionLabels: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Kategori per subtes (dari Tabel 4.1 / Kategori Skor Bakat di buku)
// Tier ranges are inclusive lower bounds. Keys: BR (Bawah Rata-rata),
// RR (Rata-rata), AR (Atas Rata-rata), B (Baik), LB (Luar Biasa).
// ───────────────────────────────────────────────────────────────────────────
export const CATEGORY_LABEL: Record<string, string> = {
  BR: "Di bawah rata-rata",
  RR: "Rata-rata",
  AR: "Di atas rata-rata",
  B: "Baik",
  LB: "Luar biasa",
};

type CategoryRanges = { [code: string]: [number, number, number, number] };
// thresholds: [maxBR, maxRR, maxAR, maxB] -> >maxB = LB
export const CATEGORY_RANGES: CategoryRanges = {
  BAKAT_1_VISUAL: [2, 6, 12, 19],
  BAKAT_2_NUMERIK: [2, 5, 8, 13],
  BAKAT_3_VERBAL: [3, 7, 11, 16],
  BAKAT_4_URUTAN: [2, 7, 11, 15],
  BAKAT_5_SPASIAL: [9, 26, 34, 42],
  BAKAT_6_3DIMENSI: [6, 12, 16, 21],
  BAKAT_7_SISTEMATISASI: [30, 60, 90, 120],
  BAKAT_8_KOSAKATA: [6, 13, 19, 26],
  BAKAT_9_FIGURAL: [5, 11, 17, 23],
};

export function categorize(code: string, raw: number): "BR" | "RR" | "AR" | "B" | "LB" {
  const r = CATEGORY_RANGES[code];
  if (!r) return "RR";
  if (raw <= r[0]) return "BR";
  if (raw <= r[1]) return "RR";
  if (raw <= r[2]) return "AR";
  if (raw <= r[3]) return "B";
  return "LB";
}

// ───────────────────────────────────────────────────────────────────────────
// 35 Profil Bakat dari Tabel 4.2 (Buku 1, Bab III). Each profile has 3
// dominant aspects (mapped to subtest codes by short tag).
// ───────────────────────────────────────────────────────────────────────────
const TAG: Record<string, string> = {
  Vis: "BAKAT_1_VISUAL",
  Num: "BAKAT_2_NUMERIK",
  Ver: "BAKAT_3_VERBAL",
  Urt: "BAKAT_4_URUTAN",
  Spa: "BAKAT_5_SPASIAL",
  "3D": "BAKAT_6_3DIMENSI",
  Sis: "BAKAT_7_SISTEMATISASI",
  Kos: "BAKAT_8_KOSAKATA",
  Fig: "BAKAT_9_FIGURAL",
};

export type ProfileDef = {
  name: string;
  aspects: string[]; // subtest codes
  description: string;
  majors: string[];
  careers: string[];
};

export const APTITUDE_PROFILES: ProfileDef[] = [
  { name: "Akuntansi dan Keuangan", aspects: [TAG.Num, TAG.Sis, TAG.Fig], description: "Bekerja sistematis dengan angka, laporan, dan pembukuan.", majors: ["Akuntansi", "Manajemen Keuangan"], careers: ["Akuntan", "Auditor", "Analis Keuangan"] },
  { name: "Agrikultur dan Manajemen Tanah", aspects: [TAG.Spa, TAG["3D"], TAG.Vis], description: "Kemampuan visual dan spasial untuk mengelola lahan dan agribisnis.", majors: ["Agronomi", "Manajemen Sumberdaya Lahan"], careers: ["Petani Modern", "Manajer Perkebunan"] },
  { name: "Arsitektur", aspects: [TAG["3D"], TAG.Spa, TAG.Num], description: "Visualisasi tiga dimensi & numerik untuk desain bangunan.", majors: ["Arsitektur", "Teknik Sipil"], careers: ["Arsitek", "Desainer Interior"] },
  { name: "Desain dan Seni", aspects: [TAG.Spa, TAG.Vis, TAG["3D"]], description: "Kepekaan estetika dan komposisi visual.", majors: ["Desain Komunikasi Visual", "Seni Rupa"], careers: ["Desainer Grafis", "Ilustrator"] },
  { name: "Sejarah Seni", aspects: [TAG.Ver, TAG.Spa, TAG.Kos], description: "Verbal & visual untuk analisis karya seni dari masa ke masa.", majors: ["Sejarah Seni", "Kuratorial"], careers: ["Kurator", "Penulis Seni"] },
  { name: "Biologi", aspects: [TAG.Vis, TAG.Num, TAG.Ver], description: "Pengamatan & analisis terhadap fenomena makhluk hidup.", majors: ["Biologi", "Bioteknologi"], careers: ["Peneliti Biologi", "Ahli Lingkungan"] },
  { name: "Katering", aspects: [TAG.Spa, TAG["3D"], TAG.Vis], description: "Tata sajian makanan & manajemen dapur.", majors: ["Tata Boga", "Manajemen Katering"], careers: ["Chef", "Manajer Katering"] },
  { name: "Kimia", aspects: [TAG.Vis, TAG.Num, TAG.Urt], description: "Eksperimen & perhitungan terstruktur.", majors: ["Kimia", "Teknik Kimia"], careers: ["Analis Lab", "Quality Control"] },
  { name: "Sastra", aspects: [TAG.Kos, TAG.Ver, TAG.Urt], description: "Olah kata & narasi.", majors: ["Sastra Indonesia", "Sastra Inggris"], careers: ["Penulis", "Editor"] },
  { name: "IT dan Komputer", aspects: [TAG.Vis, TAG.Num, TAG.Urt], description: "Algoritma, logika, dan pola.", majors: ["Teknik Informatika", "Sistem Informasi"], careers: ["Programmer", "Data Engineer", "Analis Sistem"] },
  { name: "Keterampilan dan Kerajinan Tangan", aspects: [TAG["3D"], TAG.Spa, TAG.Vis], description: "Karya dengan tangan & material.", majors: ["Kriya"], careers: ["Pengrajin", "Pengusaha Kriya"] },
  { name: "Tarian", aspects: [TAG.Spa, TAG.Vis, TAG.Ver], description: "Koordinasi gerak & ekspresi.", majors: ["Seni Tari"], careers: ["Penari", "Koreografer"] },
  { name: "Drama", aspects: [TAG.Ver, TAG.Kos, TAG.Vis], description: "Olah peran dan komunikasi panggung.", majors: ["Seni Teater"], careers: ["Aktor", "Sutradara"] },
  { name: "Ekologi dan Ilmu Lingkungan", aspects: [TAG.Vis, TAG.Num, TAG.Urt], description: "Analisis ekosistem & data lingkungan.", majors: ["Biologi", "Ilmu Lingkungan"], careers: ["Konsultan Lingkungan", "Peneliti Ekologi"] },
  { name: "Ekonomi", aspects: [TAG.Num, TAG.Ver, TAG.Fig], description: "Berpikir kuantitatif & verbal.", majors: ["Ekonomi", "Manajemen"], careers: ["Analis Ekonomi", "Manajer"] },
  { name: "Permesinan", aspects: [TAG.Num, TAG["3D"], TAG.Vis], description: "Mengoperasikan & merancang mesin.", majors: ["Teknik Mesin"], careers: ["Insinyur Mesin", "Operator Pabrik"] },
  { name: "Bahasa Inggris", aspects: [TAG.Ver, TAG.Kos, TAG.Urt], description: "Penguasaan bahasa lisan & tulis.", majors: ["Pendidikan/ Sastra Inggris"], careers: ["Penerjemah", "Guru Bahasa Inggris"] },
  { name: "Fashion", aspects: [TAG.Spa, TAG.Vis, TAG["3D"]], description: "Desain busana & visual.", majors: ["Tata Busana", "Desain Mode"], careers: ["Desainer Mode", "Stylist"] },
  { name: "Geografi", aspects: [TAG.Spa, TAG.Vis, TAG.Num], description: "Pemetaan & analisis spasial.", majors: ["Geografi", "Geomatika"], careers: ["Surveyor", "Analis GIS"] },
  { name: "Sejarah", aspects: [TAG.Vis, TAG.Ver, TAG.Kos], description: "Analisis naratif lintas waktu.", majors: ["Sejarah"], careers: ["Sejarawan", "Guide Museum"] },
  { name: "Manajemen Hotel", aspects: [TAG.Urt, TAG.Fig, TAG.Num], description: "Operasional layanan & perhitungan.", majors: ["Manajemen Perhotelan"], careers: ["Manajer Hotel", "F&B Supervisor"] },
  { name: "Tata Bahasa", aspects: [TAG.Ver, TAG.Kos, TAG.Fig], description: "Logika kebahasaan.", majors: ["Linguistik"], careers: ["Editor", "Proofreader"] },
  { name: "Hukum", aspects: [TAG.Ver, TAG.Kos, TAG.Fig], description: "Argumentasi & ketelitian aturan.", majors: ["Ilmu Hukum"], careers: ["Pengacara", "Notaris"] },
  { name: "Perpustakaan dan Ilmu Informasi", aspects: [TAG.Vis, TAG.Ver, TAG.Kos], description: "Klasifikasi & manajemen informasi.", majors: ["Ilmu Perpustakaan"], careers: ["Pustakawan", "Information Specialist"] },
  { name: "Matematika dan Statistika", aspects: [TAG.Num, TAG.Fig, TAG["3D"]], description: "Perhitungan abstrak & data.", majors: ["Matematika", "Statistika"], careers: ["Aktuaris", "Data Analyst"] },
  { name: "Media dan Komunikasi", aspects: [TAG.Ver, TAG.Vis, TAG.Spa], description: "Kreatif & ekspresif.", majors: ["Ilmu Komunikasi", "Broadcasting"], careers: ["Reporter", "Content Creator"] },
  { name: "Musik", aspects: [TAG.Urt, TAG.Spa, TAG.Vis], description: "Pola ritmis & nada.", majors: ["Seni Musik"], careers: ["Musisi", "Komposer"] },
  { name: "Keperawatan", aspects: [TAG.Vis, TAG.Urt, TAG["3D"]], description: "Telaten & sistematis dalam perawatan.", majors: ["Keperawatan"], careers: ["Perawat", "Bidan"] },
  { name: "Filsafat dan Studi Keagamaan", aspects: [TAG.Ver, TAG.Kos, TAG.Urt], description: "Pemikiran reflektif.", majors: ["Filsafat", "Studi Agama"], careers: ["Akademisi", "Ulama/Pemuka Agama"] },
  { name: "Fisika", aspects: [TAG.Num, TAG.Fig, TAG["3D"]], description: "Hukum alam & matematika.", majors: ["Fisika", "Teknik Fisika"], careers: ["Peneliti Fisika", "Engineer R&D"] },
  { name: "Politik dan Hubungan Internasional", aspects: [TAG.Ver, TAG.Kos, TAG.Vis], description: "Argumen & wawasan global.", majors: ["Hubungan Internasional", "Ilmu Politik"], careers: ["Diplomat", "Analis Kebijakan"] },
  { name: "Psikologi", aspects: [TAG.Vis, TAG.Num, TAG.Ver], description: "Memahami perilaku manusia.", majors: ["Psikologi"], careers: ["Psikolog", "HRD"] },
  { name: "Sosiologi", aspects: [TAG.Vis, TAG.Ver, TAG.Kos], description: "Analisis struktur sosial.", majors: ["Sosiologi"], careers: ["Peneliti Sosial", "CSR Officer"] },
  { name: "Olah Raga dan Penelitian Rekreasi", aspects: [TAG.Vis, TAG.Spa, TAG.Urt], description: "Koordinasi tubuh & strategi.", majors: ["Pendidikan Olahraga"], careers: ["Atlet", "Pelatih", "Manajer Event"] },
  { name: "Teknologi Tekstil", aspects: [TAG.Num, TAG.Spa, TAG.Fig], description: "Material & ukuran tekstil.", majors: ["Teknik Tekstil"], careers: ["Engineer Tekstil", "Quality Control Garment"] },
];

// ───────────────────────────────────────────────────────────────────────────
// MINAT — pemetaan Bidang (huruf A..H) → Program Keahlian
// (Tabel 4.3 Buku 1).
// ───────────────────────────────────────────────────────────────────────────
export const MINAT_BIDANG_TO_PROGRAM: Record<string, { kind: string; programs: { letter: string; label: string; major: string }[] }> = {
  A: {
    kind: "Komunikasi",
    programs: [
      { letter: "A", label: "Programmer", major: "Teknik Komputer dan Informatika" },
      { letter: "D", label: "Instalasi Jaringan", major: "Teknik Komputer dan Informatika" },
      { letter: "G", label: "Audio Visual", major: "Teknik Komputer dan Informatika" },
      { letter: "B", label: "Jaringan Internet", major: "Telekomunikasi" },
      { letter: "C", label: "Kameraman", major: "Broadcasting" },
      { letter: "F", label: "Fotografer", major: "Broadcasting" },
      { letter: "E", label: "Editing", major: "Broadcasting" },
      { letter: "H", label: "Pegawai PLN", major: "Teknik Elektronika" },
    ],
  },
  B: {
    kind: "Seni",
    programs: [
      { letter: "A", label: "Pelukis", major: "Seni Rupa" },
      { letter: "B", label: "Pengrajin Kayu", major: "Desain dan Produksi Kriya" },
      { letter: "C", label: "Musisi", major: "Seni Musik" },
      { letter: "D", label: "Penari", major: "Seni Tari" },
      { letter: "F", label: "Dalang", major: "Seni Pedalangan" },
      { letter: "E", label: "Karawitan", major: "Seni Karawitan" },
      { letter: "G", label: "Drama", major: "Seni Teater" },
      { letter: "H", label: "Peneliti Budaya", major: "Antropologi Budaya" },
    ],
  },
  C: {
    kind: "Kesehatan & Pekerja Sosial",
    programs: [
      { letter: "A", label: "Perawat", major: "Kesehatan" },
      { letter: "E", label: "Dokter", major: "Kesehatan" },
      { letter: "G", label: "Apoteker", major: "Kesehatan" },
      { letter: "C", label: "Farmasi", major: "Kesehatan" },
      { letter: "F", label: "Petugas Palang Merah", major: "Pekerja Sosial" },
      { letter: "D", label: "Panti Asuhan", major: "Pekerja Sosial" },
      { letter: "H", label: "Pekerja Sosial", major: "Pekerja Sosial" },
      { letter: "B", label: "Psikologi", major: "Pekerja Sosial" },
    ],
  },
  D: {
    kind: "Pariwisata",
    programs: [
      { letter: "E", label: "Travelling", major: "Kepariwisataan" },
      { letter: "A", label: "Pemandu Wisata", major: "Kepariwisataan" },
      { letter: "B", label: "Juru Masak", major: "Tata Boga" },
      { letter: "H", label: "Bartender", major: "Tata Boga" },
      { letter: "C", label: "Salon", major: "Tata Kecantikan" },
      { letter: "F", label: "Make Up Artist", major: "Tata Kecantikan" },
      { letter: "D", label: "Desainer", major: "Tata Busana" },
      { letter: "G", label: "Model Pakaian", major: "Tata Busana" },
    ],
  },
  E: {
    kind: "Administrasi & Niaga",
    programs: [
      { letter: "F", label: "Sekretaris", major: "Administrasi" },
      { letter: "A", label: "Administrasi", major: "Administrasi" },
      { letter: "H", label: "Kasir", major: "Administrasi" },
      { letter: "B", label: "Akuntan", major: "Keuangan" },
      { letter: "D", label: "Perbankan", major: "Keuangan" },
      { letter: "C", label: "Pemasaran", major: "Tata Niaga" },
      { letter: "G", label: "Penjualan", major: "Tata Niaga" },
      { letter: "E", label: "Marketing", major: "Tata Niaga" },
    ],
  },
  F: {
    kind: "Teknologi & Konstruksi",
    programs: [
      { letter: "A", label: "Insinyur", major: "Teknik Energi Terbarukan" },
      { letter: "C", label: "Pegawai Tambang", major: "Teknik Geologi Pertambangan" },
      { letter: "B", label: "Mekanik Pesawat", major: "Teknik Pesawat Udara" },
      { letter: "D", label: "Petugas Pertanahan", major: "Geomatika" },
      { letter: "E", label: "Kontraktor", major: "Teknik Bangunan" },
      { letter: "F", label: "Konstruksi Kayu", major: "Teknik Furniture" },
      { letter: "G", label: "Jaringan Pipa", major: "Teknik Plambing dan Sanitasi" },
      { letter: "H", label: "Komponen Listrik", major: "Teknik Ketenagalistrikan" },
      { letter: "I", label: "Pertambangan dan Minyak", major: "Teknik Perminyakan" },
      { letter: "J", label: "Percetakan", major: "Teknik Grafika" },
    ],
  },
  G: {
    kind: "Agrobisnis",
    programs: [
      { letter: "A", label: "Petugas Perkebunan", major: "Agrobisnis Produksi Tanaman" },
      { letter: "B", label: "Peternak", major: "Agrobisnis Produksi Ternak" },
      { letter: "C", label: "Dokter Hewan", major: "Kesehatan Hewan" },
      { letter: "D", label: "Pengawas Hasil Pertanian/Perikanan", major: "Agrobisnis Pengolahan Hasil Pertanian dan Perikanan" },
      { letter: "G", label: "Nelayan", major: "Agrobisnis Pengolahan Hasil Pertanian dan Perikanan" },
      { letter: "E", label: "Produksi Hasil Pertanian", major: "Mekanisme Pertanian" },
      { letter: "H", label: "Pengolahan Lahan", major: "Mekanisme Pertanian" },
      { letter: "F", label: "Konservasi Hutan", major: "Kehutanan" },
    ],
  },
  H: {
    kind: "Teknik & Maritim",
    programs: [
      { letter: "A", label: "Operator Pabrik", major: "Teknik Mesin" },
      { letter: "B", label: "Teknisi Instrumen", major: "Teknik Instrumentasi Industri" },
      { letter: "C", label: "Perawatan Mesin", major: "Teknik Industri" },
      { letter: "D", label: "Konstruksi Kapal", major: "Teknik Perkapalan" },
      { letter: "E", label: "Nakhoda", major: "Teknologi Penangkapan Ikan" },
      { letter: "H", label: "Pengolahan Hasil Tangkap", major: "Teknologi dan Produksi Perikanan Budidaya" },
      { letter: "I", label: "Desainer", major: "Teknologi Tekstil" },
      { letter: "J", label: "Berlayar", major: "Pelayaran" },
      { letter: "F", label: "Mekanik", major: "Otomotif" },
      { letter: "G", label: "Pengolahan Limbah", major: "Teknik Kimia" },
    ],
  },
};

// ───────────────────────────────────────────────────────────────────────────
// IQ Estimate — bukan IQ klinis, sekedar prediksi berbasis profil performa.
// Mean = 100, SD = 15. Z-skor agregat dari 9 subtes (raw / max ekspektasi).
// ───────────────────────────────────────────────────────────────────────────
export function estimateIQ(perSubtest: Record<string, { raw: number; max: number }>): number {
  const norms = Object.values(perSubtest).map((s) => (s.max > 0 ? s.raw / s.max : 0));
  if (norms.length === 0) return 100;
  const mean = norms.reduce((a, b) => a + b, 0) / norms.length;
  // Map a "perfect" performance (1.0) to ~145 and 0 -> 70.
  const iq = 70 + mean * 75;
  return Math.max(70, Math.min(145, Math.round(iq)));
}

export function iqInterpretation(iq: number): { band: string; description: string } {
  if (iq >= 130) return { band: "Sangat Superior", description: "Kemampuan kognitif jauh di atas rata-rata." };
  if (iq >= 120) return { band: "Superior", description: "Kemampuan kognitif di atas rata-rata." };
  if (iq >= 110) return { band: "Di Atas Rata-rata", description: "Kemampuan kognitif sedikit di atas rata-rata." };
  if (iq >= 90) return { band: "Rata-rata", description: "Kemampuan kognitif setara dengan rata-rata populasi." };
  if (iq >= 80) return { band: "Di Bawah Rata-rata", description: "Kemampuan kognitif sedikit di bawah rata-rata." };
  return { band: "Rendah", description: "Kemampuan kognitif perlu pendampingan tambahan." };
}
