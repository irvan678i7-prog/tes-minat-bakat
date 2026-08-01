-- 0006: Tes IQ CFIT Skala 3 (bentuk A & B).
-- Bank soal, token, submission, jawaban, hasil, dan norma dipisah TOTAL dari
-- tabel minat-bakat (semua tabel berprefix "Cfit").
-- Idempoten: aman dijalankan ulang di Supabase SQL Editor.

-- Enum bentuk tes
DO $$ BEGIN
  CREATE TYPE "CfitForm" AS ENUM ('FORM_3A', 'FORM_3B', 'FORM_3AB');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Token akses khusus CFIT (terpisah dari "AccessToken")
CREATE TABLE IF NOT EXISTS "CfitAccessToken" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "form"        "CfitForm" NOT NULL DEFAULT 'FORM_3AB',
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "redeemedAt"  TIMESTAMP(3),
  CONSTRAINT "CfitAccessToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitAccessToken_code_key" ON "CfitAccessToken"("code");
CREATE INDEX IF NOT EXISTS "CfitAccessToken_form_idx" ON "CfitAccessToken"("form");

-- Subtes
CREATE TABLE IF NOT EXISTS "CfitSubtest" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "form"         "CfitForm" NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "durationSec"  INTEGER NOT NULL,
  "orderIndex"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CfitSubtest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitSubtest_code_key" ON "CfitSubtest"("code");

-- Bank soal
CREATE TABLE IF NOT EXISTS "CfitQuestion" (
  "id"         TEXT NOT NULL,
  "subtestId"  TEXT NOT NULL,
  "questionNo" INTEGER NOT NULL,
  "prompt"     TEXT NOT NULL DEFAULT '',
  "imageUrl"   TEXT,
  "options"    JSONB NOT NULL,
  "correct"    JSONB NOT NULL,
  "isExample"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CfitQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CfitQuestion_subtestId_fkey" FOREIGN KEY ("subtestId")
    REFERENCES "CfitSubtest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitQuestion_subtestId_questionNo_isExample_key"
  ON "CfitQuestion"("subtestId", "questionNo", "isExample");

-- Submission (attempt peserta)
CREATE TABLE IF NOT EXISTS "CfitSubmission" (
  "id"              TEXT NOT NULL,
  "tokenId"         TEXT NOT NULL,
  "form"            "CfitForm" NOT NULL,
  "fullName"        TEXT,
  "gender"          TEXT,
  "birthPlace"      TEXT,
  "birthDate"       TIMESTAMP(3),
  "age"             INTEGER,
  "grade"           TEXT,
  "school"          TEXT,
  "phone"           TEXT,
  "email"           TEXT,
  "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"      TIMESTAMP(3),
  "randomSeed"      TEXT NOT NULL DEFAULT '',
  "violationCount"  INTEGER NOT NULL DEFAULT 0,
  "violationLog"    JSONB NOT NULL DEFAULT '[]',
  "flaggedCheating" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CfitSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CfitSubmission_tokenId_fkey" FOREIGN KEY ("tokenId")
    REFERENCES "CfitAccessToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CfitSubmission_tokenId_idx" ON "CfitSubmission"("tokenId");
CREATE INDEX IF NOT EXISTS "CfitSubmission_finishedAt_idx" ON "CfitSubmission"("finishedAt");

-- Lock per-subtes (timer server-authoritative)
CREATE TABLE IF NOT EXISTS "CfitSubtestProgress" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "subtestId"    TEXT NOT NULL,
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"   TIMESTAMP(3),
  "finishReason" TEXT,
  CONSTRAINT "CfitSubtestProgress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CfitSubtestProgress_submissionId_fkey" FOREIGN KEY ("submissionId")
    REFERENCES "CfitSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CfitSubtestProgress_subtestId_fkey" FOREIGN KEY ("subtestId")
    REFERENCES "CfitSubtest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitSubtestProgress_submissionId_subtestId_key"
  ON "CfitSubtestProgress"("submissionId", "subtestId");
CREATE INDEX IF NOT EXISTS "CfitSubtestProgress_submissionId_idx" ON "CfitSubtestProgress"("submissionId");

-- Jawaban
CREATE TABLE IF NOT EXISTS "CfitAnswer" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "questionId"   TEXT NOT NULL,
  "selected"     JSONB NOT NULL,
  "isCorrect"    BOOLEAN NOT NULL DEFAULT false,
  "answeredAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CfitAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CfitAnswer_submissionId_fkey" FOREIGN KEY ("submissionId")
    REFERENCES "CfitSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CfitAnswer_questionId_fkey" FOREIGN KEY ("questionId")
    REFERENCES "CfitQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitAnswer_submissionId_questionId_key"
  ON "CfitAnswer"("submissionId", "questionId");

-- Hasil final
CREATE TABLE IF NOT EXISTS "CfitResult" (
  "id"             TEXT NOT NULL,
  "submissionId"   TEXT NOT NULL,
  "rawScoreA"      INTEGER,
  "rawScoreB"      INTEGER,
  "rawScoreTotal"  INTEGER NOT NULL,
  "iq"             INTEGER NOT NULL,
  "classification" TEXT NOT NULL,
  "payload"        JSONB,
  "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CfitResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CfitResult_submissionId_fkey" FOREIGN KEY ("submissionId")
    REFERENCES "CfitSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitResult_submissionId_key" ON "CfitResult"("submissionId");

-- Norma RS → IQ
CREATE TABLE IF NOT EXISTS "CfitNorm" (
  "id"        TEXT NOT NULL,
  "normGroup" TEXT NOT NULL DEFAULT '17+',
  "rawScore"  INTEGER NOT NULL,
  "iq"        INTEGER NOT NULL,
  CONSTRAINT "CfitNorm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CfitNorm_normGroup_rawScore_key"
  ON "CfitNorm"("normGroup", "rawScore");

-- ───────────────────────────────────────────────────────────────────────────
-- SEED: subtes 3A & 3B (id deterministik supaya idempoten)
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO "CfitSubtest" ("id", "code", "form", "name", "description", "instructions", "durationSec", "orderIndex") VALUES
  ('cfit_3a_series',         '3A_SERIES',         'FORM_3A', 'Subtes 1 — Series',                'Melanjutkan pola rangkaian gambar yang berurutan.',                       '', 180, 1),
  ('cfit_3a_classification', '3A_CLASSIFICATION', 'FORM_3A', 'Subtes 2 — Classification',        'Memilih gambar yang berbeda / tidak sekelompok.',                          '', 240, 2),
  ('cfit_3a_matrices',       '3A_MATRICES',       'FORM_3A', 'Subtes 3 — Matrices',              'Melengkapi pola matriks gambar yang kosong.',                              '', 180, 3),
  ('cfit_3a_conditions',     '3A_CONDITIONS',     'FORM_3A', 'Subtes 4 — Conditions (Topology)', 'Memilih gambar yang memenuhi kondisi yang sama dengan contoh.',            '', 150, 4),
  ('cfit_3b_series',         '3B_SERIES',         'FORM_3B', 'Subtes 1 — Series',                'Melanjutkan pola rangkaian gambar yang berurutan.',                       '', 180, 5),
  ('cfit_3b_classification', '3B_CLASSIFICATION', 'FORM_3B', 'Subtes 2 — Classification',        'Memilih gambar yang berbeda / tidak sekelompok.',                          '', 240, 6),
  ('cfit_3b_matrices',       '3B_MATRICES',       'FORM_3B', 'Subtes 3 — Matrices',              'Melengkapi pola matriks gambar yang kosong.',                              '', 180, 7),
  ('cfit_3b_conditions',     '3B_CONDITIONS',     'FORM_3B', 'Subtes 4 — Conditions (Topology)', 'Memilih gambar yang memenuhi kondisi yang sama dengan contoh.',            '', 150, 8)
ON CONFLICT ("code") DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- SEED: norma RS → IQ untuk usia 17 tahun ke atas
-- (sumber: tabel "NORMA TES INTELEGENSI CFIT 3A DAN CFIT 3B")
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO "CfitNorm" ("id", "normGroup", "rawScore", "iq") VALUES
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
ON CONFLICT ("normGroup", "rawScore") DO NOTHING;
