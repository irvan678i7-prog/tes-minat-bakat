"""Run: python3 tests/cfit-legacy-norm.test.py

Rehearses the exact cleanup DELETE on an isolated SQLite database using
only Python's standard library. This validates row selection, preservation,
idempotence, and rollback, NOT PostgreSQL SET/COMMENT/locking behavior.
Run the complete migration on PostgreSQL staging before production.
"""
from pathlib import Path
import re
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
OLD_SQL = (ROOT / "prisma/sql/0006_cfit_tables.sql").read_text()
NEW_SQL = (ROOT / "prisma/sql/0012_retire_legacy_cfit_norm.sql").read_text()
DELETE_SQL = re.search(r"WITH legacy_seed\b.*?;", NEW_SQL, re.S).group(0)


def seed_rows(text):
    return [
        (row_id, group, int(raw), int(iq))
        for row_id, group, raw, iq in re.findall(
            r"\('([^']+)',\s*'([^']+)',\s*(\d+),\s*(\d+)\)", text
        )
    ]


SEED = seed_rows(OLD_SQL.split('INSERT INTO "CfitNorm"', 1)[1])


class LegacyNormCleanupTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.db.execute("ATTACH DATABASE ':memory:' AS public")
        self.db.execute('''CREATE TABLE public."CfitNorm" (
            "id" TEXT PRIMARY KEY, "normGroup" TEXT NOT NULL,
            "rawScore" INTEGER NOT NULL, "iq" INTEGER NOT NULL,
            UNIQUE ("normGroup", "rawScore")
        )''')
        self.db.executemany('INSERT INTO public."CfitNorm" VALUES (?, ?, ?, ?)', SEED)

    def tearDown(self):
        self.db.close()

    def rows(self):
        return self.db.execute('SELECT * FROM public."CfitNorm" ORDER BY "id"').fetchall()

    def cleanup(self):
        self.db.execute(DELETE_SQL)

    def test_allowlist_matches_all_50_original_seed_rows_exactly(self):
        self.assertEqual(len(SEED), 50)
        self.assertEqual(seed_rows(DELETE_SQL), SEED)
        self.assertEqual([row[2] for row in SEED], list(range(50)))

    def test_removes_unchanged_seed_only(self):
        self.assertEqual(len(self.rows()), 50)
        self.cleanup()
        self.assertEqual(self.rows(), [])

    def test_each_of_four_columns_must_match(self):
        self.db.execute('UPDATE public."CfitNorm" SET "id" = ? WHERE "id" = ?',
                        ("manual_00", "cfitnorm17_00"))
        self.db.execute('UPDATE public."CfitNorm" SET "normGroup" = ? WHERE "id" = ?',
                        ("15", "cfitnorm17_01"))
        self.db.execute('UPDATE public."CfitNorm" SET "rawScore" = ? WHERE "id" = ?',
                        (200, "cfitnorm17_02"))
        self.db.execute('UPDATE public."CfitNorm" SET "iq" = ? WHERE "id" = ?',
                        (65, "cfitnorm17_03"))
        expected_ids = {"manual_00", "cfitnorm17_01", "cfitnorm17_02", "cfitnorm17_03"}
        expected = [row for row in self.rows() if row[0] in expected_ids]
        self.cleanup()
        self.assertEqual(self.rows(), expected)

    def test_custom_rows_and_other_age_groups_are_preserved(self):
        custom = [
            ("manual17_50", "17+", 50, 113),
            ("custom15_20", "15", 20, 66),
            ("cfitnorm17_99", "17+", 99, 193),
        ]
        self.db.executemany('INSERT INTO public."CfitNorm" VALUES (?, ?, ?, ?)', custom)
        self.cleanup()
        self.assertEqual(self.rows(), sorted(custom))

    def test_rerun_is_idempotent(self):
        self.db.execute('UPDATE public."CfitNorm" SET "iq" = 65 WHERE "id" = ?',
                        ("cfitnorm17_20",))
        self.cleanup()
        after_first = self.rows()
        self.cleanup()
        self.assertEqual(self.rows(), after_first)
        self.assertEqual(len(after_first), 1)

    def test_empty_table_is_a_noop(self):
        self.db.execute('DELETE FROM public."CfitNorm"')
        self.cleanup()
        self.assertEqual(self.rows(), [])

    def test_data_deletion_can_be_rolled_back(self):
        before = self.rows()
        self.db.execute("BEGIN")
        self.cleanup()
        self.assertEqual(self.rows(), [])
        self.db.execute("ROLLBACK")
        self.assertEqual(self.rows(), before)

    def test_other_cfit_and_minat_bakat_tables_are_unchanged(self):
        tables = ["CfitSubtest", "CfitQuestion", "CfitAccessToken", "CfitSubmission",
                  "CfitSubtestProgress", "CfitAnswer", "CfitResult",
                  "AccessToken", "Subtest", "Question", "Submission", "Answer", "Result"]
        for table in tables:
            self.db.execute(f'CREATE TABLE public."{table}" (id TEXT, value TEXT)')
            self.db.execute(f'INSERT INTO public."{table}" VALUES (?, ?)',
                            ("unchanged", f"data-{table}"))
        writes = []

        def authorize(action, table, column, database, source):
            if action in (sqlite3.SQLITE_DELETE, sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE):
                writes.append((action, table, database))
            return sqlite3.SQLITE_OK

        self.db.set_authorizer(authorize)
        self.cleanup()
        self.db.set_authorizer(None)
        self.assertEqual(writes, [(sqlite3.SQLITE_DELETE, "CfitNorm", "public")])
        for table in tables:
            self.assertEqual(self.db.execute(f'SELECT * FROM public."{table}"').fetchall(),
                             [("unchanged", f"data-{table}")])

    def test_cleanup_after_replaying_historical_seed(self):
        self.cleanup()
        self.db.executemany('INSERT INTO public."CfitNorm" VALUES (?, ?, ?, ?)', SEED)
        self.cleanup()
        self.assertEqual(self.rows(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
