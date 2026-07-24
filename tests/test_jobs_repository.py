"""Unit tests for JobsRepository (Supabase jobs upsert/list)."""
import pytest
from api.jobs_repository import JobsRepository, build_jobs_repository

pytestmark = pytest.mark.unit

JOB = {
    "job_url": "https://www.linkedin.com/jobs/view/123/",
    "title": "AI Engineer", "company": "Acme", "location": "Sydney",
    "posted": "1 day ago", "applicants": "10 applicants", "description": "Build.",
}


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
        self.upserted = None
        self.on_conflict = None

    def upsert(self, row, on_conflict=None):
        self.upserted = row
        self.on_conflict = on_conflict
        return self

    def select(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class FakeClient:
    def __init__(self, rows=None):
        self._table = FakeTable(rows or [])

    def table(self, name):
        return self._table


def test_upsert_maps_fields_and_conflicts_on_url():
    c = FakeClient()
    JobsRepository(c).upsert(JOB)
    assert c._table.on_conflict == "url"
    assert c._table.upserted == {
        "role": "AI Engineer", "company": "Acme",
        "url": "https://www.linkedin.com/jobs/view/123/",
        "location": "Sydney", "description": "Build.",
    }


def test_upsert_skips_no_company():
    c = FakeClient()
    JobsRepository(c).upsert({**JOB, "company": None})
    assert c._table.upserted is None   # never called


def test_list_jobs_returns_rows():
    rows = [{"id": "1", "role": "AI Engineer", "company": "Acme"}]
    c = FakeClient(rows=rows)
    assert JobsRepository(c).list_jobs() == rows


def test_build_returns_none_when_unconfigured():
    assert build_jobs_repository(None, None) is None
    assert build_jobs_repository("https://x.supabase.co", None) is None
