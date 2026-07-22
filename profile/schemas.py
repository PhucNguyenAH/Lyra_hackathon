"""Validated contracts keep profile facts traceable through ingestion and tailoring."""

from typing import Any

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


class MasterProfile(BaseModel):
    summary: str = ""
    skills: list[Skill] = Field(default_factory=list)
    experiences: list[Experience] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)


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
