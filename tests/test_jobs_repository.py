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
        self.inserted = None
        self.updated = None

    def upsert(self, row, on_conflict=None):
        self.upserted = row
        self.on_conflict = on_conflict
        return self

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def insert(self, row):
        self.inserted = row
        return self

    def update(self, row):
        self.updated = row
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


def test_upsert_maps_fields_and_inserts_when_url_is_new():
    c = FakeClient()
    JobsRepository(c).upsert(JOB)
    assert c._table.inserted == {
        "role": "AI Engineer", "company": "Acme",
        "url": "https://www.linkedin.com/jobs/view/123/",
        "location": "Sydney", "description": "Build.",
    }


def test_upsert_skips_no_company():
    c = FakeClient()
    JobsRepository(c).upsert({**JOB, "company": None})
    assert c._table.inserted is None


def test_list_jobs_returns_rows():
    rows = [{"id": "1", "role": "AI Engineer", "company": "Acme", "url": "https://www.linkedin.com/jobs/view/123/"}]
    c = FakeClient(rows=rows)
    assert JobsRepository(c).list_jobs() == rows


def test_list_jobs_excludes_legacy_non_scraper_rows():
    rows = [
        {"id": "seed", "role": "Backend Engineer", "company": "Demo", "url": "https://example.com/jobs/1"},
        {"id": "scraped", "role": "AI Engineer", "company": "Acme", "url": "https://www.linkedin.com/jobs/view/123/"},
    ]
    assert JobsRepository(FakeClient(rows=rows)).list_jobs() == [rows[1]]


def test_build_returns_none_when_unconfigured():
    assert build_jobs_repository(None, None) is None
    assert build_jobs_repository("https://x.supabase.co", None) is None
