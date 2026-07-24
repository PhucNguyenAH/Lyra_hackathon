"""Unit tests for the in-memory JobStore."""
import pytest
from api.store import JobStore

pytestmark = pytest.mark.unit


def test_create_returns_id_and_pending_status():
    store = JobStore()
    job_id = store.create()
    assert isinstance(job_id, str) and len(job_id) > 0
    assert store.get(job_id) == {"status": "pending", "results": None, "error": None}


def test_create_returns_unique_ids():
    store = JobStore()
    assert store.create() != store.create()


def test_set_updates_fields():
    store = JobStore()
    job_id = store.create()
    store.set(job_id, status="done", results=[{"title": "AI Engineer"}])
    stored = store.get(job_id)
    assert stored["status"] == "done"
    assert stored["results"] == [{"title": "AI Engineer"}]
    assert stored["error"] is None


def test_get_unknown_returns_none():
    store = JobStore()
    assert store.get("nope") is None


def test_get_returns_copy_not_reference():
    store = JobStore()
    job_id = store.create()
    got = store.get(job_id)
    got["status"] = "mutated"
    assert store.get(job_id)["status"] == "pending"
