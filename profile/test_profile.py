"""No-network coverage for profile merging, grounding retries, and version safety."""

from types import SimpleNamespace
from typing import Any

import pytest

from profile import db, ingest, tailor
from profile.db import ProfileVersionConflictError
from profile.schemas import (
    CVVariant,
    Education,
    MasterProfile,
    ProfileRecord,
    Project,
    SelectedItem,
    Skill,
)


CV_BACKEND = """PASTE BACKEND CV TEXT HERE"""
CV_QUANT = """PASTE QUANT CV TEXT HERE"""


def test_education_is_structured_and_legacy_strings_remain_loadable() -> None:
    structured = Education(
        id="edu-macquarie-bit-ai",
        institution="Macquarie University",
        degree="Bachelor of Information Technology",
        field_of_study="Major in Artificial Intelligence",
        date_range="Feb 2025 - Expected 2027",
        wam="92.375 - High Distinction",
        coursework=["Data Structure & Algorithms"],
        honours_awards=["Dean’s List 2026"],
    )

    profile = MasterProfile(education=[structured])
    legacy = MasterProfile.model_validate({"education": ["Macquarie University"]})

    assert profile.education[0].wam == "92.375 - High Distinction"
    assert legacy.education[0].institution == "Macquarie University"
    assert legacy.education[0].degree == ""


class FakeCompletions:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        return self.responses.pop(0)


def fake_client(responses: list[object]) -> tuple[object, FakeCompletions]:
    completions = FakeCompletions(responses)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return client, completions


def test_ingest_merges_shared_project_with_unioned_bullets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend_project = Project(
        id="proj-bankflow",
        name="BankFlow",
        description="Payments API",
        bullets=["Implemented idempotent payment creation."],
        tech=["python"],
        role_flavors=["backend", "quant"],
    )
    quant_project = Project(
        id="proj-bankflow",
        name="BankFlow",
        description="Payments API",
        bullets=["Added locking to prevent concurrent balance corruption."],
        tech=["postgresql"],
        role_flavors=["backend", "quant"],
    )
    first_extraction = MasterProfile(projects=[backend_project])
    first_merge = MasterProfile(projects=[backend_project])
    second_extraction = MasterProfile(projects=[quant_project])
    second_merge = MasterProfile(
        projects=[
            Project(
                id="proj-bankflow",
                name="BankFlow",
                description="Payments API",
                bullets=backend_project.bullets + quant_project.bullets,
                tech=["python", "postgresql"],
                role_flavors=["backend", "quant"],
            )
        ]
    )
    client, completions = fake_client(
        [first_extraction, first_merge, second_extraction, second_merge]
    )
    current = ProfileRecord(
        id="profile-1",
        user_id="user-1",
        master=MasterProfile.empty(),
        version=1,
    )
    uploaded_extractions: list[MasterProfile] = []

    def get_profile(_: str) -> ProfileRecord:
        return current

    def insert_cv_upload(**kwargs: Any) -> None:
        uploaded_extractions.append(kwargs["extracted"])

    def save_master(
        profile_id: str,
        master: MasterProfile,
        expected_version: int,
    ) -> ProfileRecord:
        assert profile_id == current.id
        assert expected_version == current.version
        current.master = master
        current.version += 1
        return current

    monkeypatch.setattr(ingest, "create_structured_client", lambda: client)
    monkeypatch.setattr(ingest, "get_profile", get_profile)
    monkeypatch.setattr(ingest, "insert_cv_upload", insert_cv_upload)
    monkeypatch.setattr(ingest, "save_master", save_master)

    ingest.ingest_cv(current.id, CV_BACKEND, "backend CV")
    result = ingest.ingest_cv(current.id, CV_QUANT, "quant CV")

    assert len(result.projects) == 1
    assert set(result.projects[0].bullets) == {
        "Implemented idempotent payment creation.",
        "Added locking to prevent concurrent balance corruption.",
    }
    assert uploaded_extractions == [first_extraction, second_extraction]
    assert len(completions.calls) == 4


def test_validate_variant_rejects_invented_item_and_skill() -> None:
    master = MasterProfile(
        skills=[Skill(name="python", evidence=["proj-bankflow"])],
        projects=[
            Project(
                id="proj-bankflow",
                name="BankFlow",
                description="Payments API",
                bullets=["Implemented idempotent payment creation."],
                tech=["python"],
                role_flavors=["backend"],
            )
        ],
    )
    variant = CVVariant(
        target_summary="Backend developer",
        selected_projects=[
            SelectedItem(
                item_id="proj-invented",
                kept_bullets=["Invented bullet"],
                order=0,
                why="Supposedly relevant",
            )
        ],
        emphasized_skills=["rust"],
        rationale="Prioritized backend work.",
    )

    errors = tailor.validate_variant(variant, master)

    assert "Unknown project item_id: proj-invented" in errors
    assert "Unknown emphasized skill: rust" in errors


def test_tailor_retries_once_then_persists_valid_variant(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bullet = "Implemented idempotent payment creation."
    master = MasterProfile(
        skills=[Skill(name="python", evidence=["proj-bankflow"])],
        projects=[
            Project(
                id="proj-bankflow",
                name="BankFlow",
                description="Payments API",
                bullets=[bullet],
                tech=["python"],
                role_flavors=["backend"],
            )
        ],
    )
    invalid = CVVariant(
        target_summary="Backend developer",
        selected_projects=[
            SelectedItem(
                item_id="proj-invented",
                kept_bullets=["Invented bullet"],
                order=0,
                why="Relevant",
            )
        ],
        rationale="Prioritized backend work.",
    )
    valid = CVVariant(
        target_summary="Backend developer",
        selected_projects=[
            SelectedItem(
                item_id="proj-bankflow",
                kept_bullets=[bullet],
                order=0,
                why="Matches the API requirements",
            )
        ],
        emphasized_skills=["python"],
        rationale="Prioritized backend work.",
    )
    client, completions = fake_client([invalid, valid])
    persisted: list[dict[str, Any]] = []
    monkeypatch.setattr(tailor, "create_structured_client", lambda: client)
    monkeypatch.setattr(
        tailor,
        "insert_cv_variant",
        lambda **kwargs: persisted.append(kwargs),
    )

    result = tailor.tailor_cv("application-1", master, "Backend role", 3)

    assert result == valid
    assert len(completions.calls) == 2
    assert "Unknown project item_id: proj-invented" in completions.calls[1][
        "messages"
    ][0]["content"]
    assert persisted == [
        {
            "application_id": "application-1",
            "variant": valid,
            "profile_version": 3,
        }
    ]


def test_save_master_rejects_version_conflict(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class EmptyUpdate:
        data: list[object] = []

    class FakeQuery:
        def table(self, _: str) -> "FakeQuery":
            return self

        def update(self, _: dict[str, object]) -> "FakeQuery":
            return self

        def eq(self, _column: str, _value: object) -> "FakeQuery":
            return self

        def execute(self) -> EmptyUpdate:
            return EmptyUpdate()

    monkeypatch.setattr(db, "_get_client", lambda: FakeQuery())

    with pytest.raises(ProfileVersionConflictError):
        db.save_master("profile-1", MasterProfile.empty(), expected_version=4)
