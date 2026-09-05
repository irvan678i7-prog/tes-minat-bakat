-- 0012: Hapus hanya seed norma CFIT lama dari 0006 yang belum berubah.
-- Sumber konversi aktif tetap src/lib/cfit/norms.ts, BUKAN tabel CfitNorm.
-- Tidak mengganti norma aktif, menghitung ulang hasil, atau mengubah enum.
--
-- Prasyarat: 0006 sudah di-apply (tabel public."CfitNorm" tersedia).
-- Keempat kolom harus cocok persis: id, normGroup, rawScore, dan iq.
-- Baris yang diubah manual / ditambahkan di luar seed TIDAK dihapus.
-- Idempoten: pengulangan tidak menghapus data lain. Jika 0006 dijalankan
-- ulang sesudah ini, jalankan 0012 lagi karena 0006 dapat menanam ulang seed.
-- Uji di staging dan siapkan backup sebelum menjalankan di produksi.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

WITH legacy_seed ("id", "normGroup", "rawScore", "iq") AS (
  VALUES
  ('cfitnorm17_00', '17+',  0,  38),
  ('cfitnorm17_01', '17+',  1,  40),
  ('cfitnorm17_02', '17+',  2,  43),
  ('cfitnorm17_03', '17+',  3,  45),
  ('cfitnorm17_04', '17+',  4,  47),
  ('cfitnorm17_05', '17+',  5,  48),
  ('cfitnorm17_06', '17+',  6,  52),
  ('cfitnorm17_07', '17+',  7,  55),
  ('cfitnorm17_08', '17+',  8,  57),
  ('cfitnorm17_09', '17+',  9,  60),
  ('cfitnorm17_10', '17+', 10,  63),
  ('cfitnorm17_11', '17+', 11,  67),
  ('cfitnorm17_12', '17+', 12,  70),
  ('cfitnorm17_13', '17+', 13,  72),
  ('cfitnorm17_14', '17+', 14,  75),
  ('cfitnorm17_15', '17+', 15,  78),
  ('cfitnorm17_16', '17+', 16,  81),
  ('cfitnorm17_17', '17+', 17,  85),
  ('cfitnorm17_18', '17+', 18,  88),
  ('cfitnorm17_19', '17+', 19,  91),
  ('cfitnorm17_20', '17+', 20,  94),
  ('cfitnorm17_21', '17+', 21,  96),
  ('cfitnorm17_22', '17+', 22, 100),
  ('cfitnorm17_23', '17+', 23, 103),
  ('cfitnorm17_24', '17+', 24, 106),
  ('cfitnorm17_25', '17+', 25, 109),
  ('cfitnorm17_26', '17+', 26, 113),
  ('cfitnorm17_27', '17+', 27, 116),
  ('cfitnorm17_28', '17+', 28, 119),
  ('cfitnorm17_29', '17+', 29, 121),
  ('cfitnorm17_30', '17+', 30, 124),
  ('cfitnorm17_31', '17+', 31, 128),
  ('cfitnorm17_32', '17+', 32, 131),
  ('cfitnorm17_33', '17+', 33, 133),
  ('cfitnorm17_34', '17+', 34, 137),
  ('cfitnorm17_35', '17+', 35, 140),
  ('cfitnorm17_36', '17+', 36, 142),
  ('cfitnorm17_37', '17+', 37, 145),
  ('cfitnorm17_38', '17+', 38, 149),
  ('cfitnorm17_39', '17+', 39, 152),
  ('cfitnorm17_40', '17+', 40, 155),
  ('cfitnorm17_41', '17+', 41, 157),
  ('cfitnorm17_42', '17+', 42, 161),
  ('cfitnorm17_43', '17+', 43, 165),
  ('cfitnorm17_44', '17+', 44, 167),
  ('cfitnorm17_45', '17+', 45, 169),
  ('cfitnorm17_46', '17+', 46, 173),
  ('cfitnorm17_47', '17+', 47, 176),
  ('cfitnorm17_48', '17+', 48, 179),
  ('cfitnorm17_49', '17+', 49, 183)
)
DELETE FROM public."CfitNorm" AS current_norm
WHERE EXISTS (
  SELECT 1
  FROM legacy_seed AS seed
  WHERE current_norm."id" = seed."id"
    AND current_norm."normGroup" = seed."normGroup"
    AND current_norm."rawScore" = seed."rawScore"
    AND current_norm."iq" = seed."iq"
);

COMMENT ON TABLE public."CfitNorm" IS
  'LEGACY / NOT USED BY APP: active CFIT RS-to-IQ conversion is in src/lib/cfit/norms.ts. Migration 0012 removes unchanged 0006 seed rows only; remaining custom rows are not validated norms.';

COMMIT;
