"""PROD-READY Phase 8: synthetic demo sessions never enter a calibration run.

Every job reads through ``jobs._base.fetch_all``; rows naming a session owned
by a demo account (database view ``demo_session_ids``, migration 0061) are
dropped there. These tests use a fake DB-API connection (no database).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs import _base  # noqa: E402


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self.description = None
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.conn.executed.append(sql)
        if "to_regclass" in sql:
            self._rows = [(self.conn.has_view,)]
        elif "FROM demo_session_ids" in sql:
            self._rows = [(s,) for s in self.conn.demo]
        else:
            self.description = [(c,) for c in self.conn.cols]
            self._rows = list(self.conn.rows)

    def fetchone(self):
        return self._rows[0]

    def fetchall(self):
        return list(self._rows)


class FakeConn:
    def __init__(self, cols, rows, demo=(), has_view=True):
        self.cols, self.rows, self.demo, self.has_view = cols, rows, demo, has_view
        self.executed = []

    def cursor(self):
        return FakeCursor(self)


class TestDemoExclusion(unittest.TestCase):
    def test_rows_of_demo_sessions_are_dropped(self):
        conn = FakeConn(["session_id", "score"], [("real-1", 3), ("demo-1", 5), ("real-2", 2)], demo=("demo-1",))
        rows = _base.fetch_all(conn, "SELECT session_id, score FROM human_ratings")
        self.assertEqual([r["session_id"] for r in rows], ["real-1", "real-2"])

    def test_every_session_column_is_checked(self):
        for col in _base.SESSION_KEYS:
            conn = FakeConn([col, "x"], [("demo-9", 1), ("real-9", 2)], demo=("demo-9",))
            rows = _base.fetch_all(conn, "SELECT")
            self.assertEqual([r[col] for r in rows], ["real-9"], col)

    def test_no_view_means_no_demo_data(self):
        conn = FakeConn(["session_id"], [("a",), ("b",)], demo=("a",), has_view=False)
        self.assertEqual(len(_base.fetch_all(conn, "SELECT")), 2)
        self.assertFalse(any("FROM demo_session_ids" in q for q in conn.executed))

    def test_rows_without_a_session_column_are_kept(self):
        conn = FakeConn(["run_type", "outputs"], [("dif", "{}")], demo=("demo-1",))
        self.assertEqual(len(_base.fetch_all(conn, "SELECT")), 1)

    def test_no_connection_has_no_demo_sessions(self):
        self.assertEqual(_base.demo_session_ids(None), frozenset())


if __name__ == "__main__":
    unittest.main()
