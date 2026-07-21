"""Live-model safety evaluation for inbox classification and status decisions."""

import json
import os
from pathlib import Path
from typing import cast

import pytest

from email_services.classifier import classify
from email_services.matcher import match_application
from email_services.schemas import ClassifiedEmail, EmailIntent
from email_services.transitions import decide


EXPECTED_FIXTURE_COUNT = 12
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "emails.json"
GROQ_API_KEY_ENV = "GROQ_API_KEY"

EmailPayload = dict[str, str]
ApplicationPayload = dict[str, object]
FixturePayload = dict[str, object]


def _load_fixtures() -> list[FixturePayload]:
    """Reject a silently truncated corpus before reporting misleading accuracy."""
    with FIXTURE_PATH.open(encoding="utf-8") as fixture_file:
        raw_fixtures = json.load(fixture_file)
    if not isinstance(raw_fixtures, list):
        raise TypeError("Email fixtures must be a JSON list")
    fixtures = [dict(item) for item in raw_fixtures if isinstance(item, dict)]
    if len(fixtures) != EXPECTED_FIXTURE_COUNT:
        raise AssertionError(
            f"Expected {EXPECTED_FIXTURE_COUNT} fixtures, found {len(fixtures)}"
        )
    return fixtures


def run_evaluation() -> tuple[float, list[str]]:
    """Measure intent quality while treating every unsafe automatic update as fatal."""
    fixtures = _load_fixtures()
    correct_intents = 0
    false_auto_updates: list[str] = []

    for fixture in fixtures:
        fixture_id = str(fixture["id"])
        email_data = cast(EmailPayload, fixture["email"])
        applications = cast(list[ApplicationPayload], fixture["applications"])
        expected_intent = EmailIntent(str(fixture["expected_intent"]))
        expected_auto = bool(fixture["expected_auto"])

        classified = classify(email_data)
        application, match_score = match_application(classified, applications)
        decision = decide(application, classified, match_score)

        intent_correct = classified.intent is expected_intent
        correct_intents += int(intent_correct)
        if decision == "auto" and not expected_auto:
            false_auto_updates.append(fixture_id)

        print(
            f"{fixture_id}: expected={expected_intent.value} "
            f"predicted={classified.intent.value} confidence={classified.confidence:.2f} "
            f"match={match_score:.2f} decision={decision}"
        )

    intent_accuracy = correct_intents / len(fixtures)
    print(f"Intent accuracy: {intent_accuracy:.1%}")
    print(f"False auto-updates: {len(false_auto_updates)}")
    return intent_accuracy, false_auto_updates


def test_null_proposed_times_are_normalized() -> None:
    """Keep a harmless model null from aborting the entire inbox polling iteration."""
    classified = ClassifiedEmail.model_validate(
        {
            "intent": "interview_invite",
            "company_guess": "Canva",
            "role_guess": "Frontend Engineer",
            "proposed_times": None,
            "confidence": 0.9,
        }
    )

    assert classified.proposed_times == []


@pytest.mark.integration
def test_watcher_evaluation() -> None:
    """Block releases when any fixture causes an unsupported automatic transition."""
    if not os.getenv(GROQ_API_KEY_ENV):
        pytest.skip(f"{GROQ_API_KEY_ENV} is required for the live classifier evaluation")

    _, false_auto_updates = run_evaluation()
    assert false_auto_updates == []


if __name__ == "__main__":
    if not os.getenv(GROQ_API_KEY_ENV):
        raise SystemExit(f"Set {GROQ_API_KEY_ENV} before running this evaluation")
    _, unsafe_updates = run_evaluation()
    if unsafe_updates:
        raise SystemExit(f"Unsafe auto-updates: {', '.join(unsafe_updates)}")
