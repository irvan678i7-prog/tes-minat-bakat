-- Class/broadcast token: 1 token = banyak siswa.
--
-- Sebelumnya `Submission.tokenId` punya UNIQUE constraint (relasi 1-1 dengan
-- AccessToken). Untuk skenario "1 link kelas, banyak peserta", drop unique
-- dan ganti dengan index non-unique. Idempotent: cek dulu sebelum drop/create.

DO $$
BEGIN
  -- Drop unique constraint kalau masih ada (Prisma generate biasanya membuat
  -- index bernama "Submission_tokenId_key" untuk @unique).
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'Submission_tokenId_key'
  ) THEN
    EXECUTE 'DROP INDEX "Submission_tokenId_key"';
  END IF;
END
$$;

-- Index non-unique untuk percepat lookup submission per token (admin tokens
-- list ngitung peserta per token, redeem ngecek submission existing di browser).
CREATE INDEX IF NOT EXISTS "Submission_tokenId_idx" ON "Submission"("tokenId");

-- Index tambahan untuk membantu sorting/filter status pengerjaan.
CREATE INDEX IF NOT EXISTS "Submission_finishedAt_idx" ON "Submission"("finishedAt");
