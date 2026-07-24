"""Validated contracts keep profile facts traceable through ingestion and tailoring."""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


ROLE_FLAVORS: frozenset[str] = frozenset(
    {
        "backend",
        "frontend",
        "fullstack",
        "ai",
        "ml",
        "data",
        "devops",
        "cloud",
        "quant",
        "mobile",
        "security",
        "platform",
    }
)


def _validate_role_flavors(value: Any) -> Any:
    """Reject unknown tags so role-based selection remains predictable."""
    if not isinstance(value, list):
        return value

    invalid = sorted(
        flavor
        for flavor in value
        if not isinstance(flavor, str) or flavor not in ROLE_FLAVORS
    )
    if invalid:
        allowed = ", ".join(sorted(ROLE_FLAVORS))
        raise ValueError(
            f"Unknown role_flavors: {', '.join(map(str, invalid))}. "
            f"Allowed values: {allowed}"
        )
    return value


class Skill(BaseModel):
    name: str
    evidence: list[str] = Field(default_factory=list)


class Experience(BaseModel):
    id: str
    role: str
    org: str
    period: str | None = None
    bullets: list[str] = Field(default_factory=list)
    tech: list[str] = Field(default_factory=list)
    role_flavors: list[str] = Field(default_factory=list)

    _role_flavors_are_known = field_validator("role_flavors", mode="before")(
        _validate_role_flavors
    )


class Project(BaseModel):
    id: str
    name: str
    description: str
    bullets: list[str] = Field(default_factory=list)
    tech: list[str] = Field(default_factory=list)
    role_flavors: list[str] = Field(default_factory=list)

    _role_flavors_are_known = field_validator("role_flavors", mode="before")(
        _validate_role_flavors
    )


class Education(BaseModel):
    """Keep education facts separate so repeated CV uploads can be deduplicated."""

    id: str
    institution: str
    degree: str = ""
    field_of_study: str = ""
    location: str = ""
    date_range: str = ""
    wam: str | None = None
    coursework: list[str] = Field(default_factory=list)
    honours_awards: list[str] = Field(default_factory=list)


class MasterProfile(BaseModel):
    summary: str = ""
    skills: list[Skill] = Field(default_factory=list)
    experiences: list[Experience] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)

    @field_validator("education", mode="before")
    @classmethod
    def normalize_legacy_education(cls, value: Any) -> Any:
        """Load old string-only profiles without losing their original text."""
        if not isinstance(value, list):
            return value
        normalized: list[Any] = []
        for index, item in enumerate(value):
            if isinstance(item, str):
                normalized.append(
                    {
                        "id": f"edu-legacy-{index}",
                        "institution": item,
                    }
                )
            else:
                normalized.append(item)
        return normalized

    @classmethod
    def empty(cls) -> "MasterProfile":
        """Give first uploads the same valid input contract as later merges."""
        return cls(
            summary="",
            skills=[],
            experiences=[],
            projects=[],
            education=[],
        )


class ExtractedCV(BaseModel):
    """Keep CV identity hints separate from evidence used for tailoring."""

    master: MasterProfile
    display_name: str = ""
    email: str = ""
    current_title: str = ""
    current_location: str = ""


class CandidatePreferences(BaseModel):
    display_name: str = ""
    email: str = ""
    current_title: str = ""
    current_location: str = ""
    target_titles: list[str] = Field(default_factory=list)
    preferred_locations: list[str] = Field(default_factory=list)
    work_modes: list[Literal["remote", "hybrid", "onsite"]] = Field(
        default_factory=list
    )
    employment_types: list[
        Literal["internship", "graduate", "full-time", "contract"]
    ] = Field(default_factory=list)
    willing_to_relocate: bool = False
    work_authorization: str = ""
    salary_expectation: str = ""


class ProfileRecord(BaseModel):
    id: str
    user_id: str | None
    master: MasterProfile
    preferences: CandidatePreferences = Field(default_factory=CandidatePreferences)
    version: int


class SelectedItem(BaseModel):
    item_id: str
    kept_bullets: list[str] = Field(default_factory=list)
    order: int = Field(ge=0)
    why: str


class CVVariant(BaseModel):
    target_summary: str
    selected_experiences: list[SelectedItem] = Field(default_factory=list)
    selected_projects: list[SelectedItem] = Field(default_factory=list)
    emphasized_skills: list[str] = Field(default_factory=list)
    omitted_notable: list[str] = Field(default_factory=list)
    rationale: str
