"""Conservative fuzzy matching between classified mail and tracked applications."""

from collections.abc import Mapping, Sequence
from typing import TypeVar

from rapidfuzz import fuzz

from email_services.schemas import ClassifiedEmail


ALLOWED_APPLICATION_STATUSES = frozenset({"applied", "interview", "offer"})
COMPANY_FIELD = "company"
RAPIDFUZZ_MAX_SCORE = 100.0
STATUS_FIELD = "status"

ApplicationT = TypeVar("ApplicationT")


def _field_value(application: object, field_name: str) -> object | None:
    """Support DB rows and mapping fixtures without coupling matching to one ORM."""
    if isinstance(application, Mapping):
        return application.get(field_name)
    return getattr(application, field_name, None)


def _status_value(application: object) -> str:
    """Normalize string and enum statuses so eligibility checks remain predictable."""
    raw_status = _field_value(application, STATUS_FIELD)
    enum_value = getattr(raw_status, "value", raw_status)
    return str(enum_value).strip().lower() if enum_value is not None else ""


def match_application(
    classified: ClassifiedEmail,
    apps: Sequence[ApplicationT],
) -> tuple[ApplicationT | None, float]:
    """Limit candidates before fuzzy matching to prevent updates to unsubmitted jobs."""
    if not classified.company_guess:
        return None, 0.0

    best_application: ApplicationT | None = None
    best_score = 0.0

    for application in apps:
        if _status_value(application) not in ALLOWED_APPLICATION_STATUSES:
            continue

        company = _field_value(application, COMPANY_FIELD)
        if not isinstance(company, str) or not company.strip():
            continue

        score = fuzz.token_set_ratio(classified.company_guess, company) / RAPIDFUZZ_MAX_SCORE
        if score > best_score:
            best_application = application
            best_score = score

    return best_application, best_score
