"""Tailor by selection, then enforce that every returned fact is traceable."""

import json
from typing import cast

from interview.llm import (
    MAX_RETRIES,
    MODEL_NAME,
    MODEL_TEMPERATURE,
    StructuredClient,
    create_structured_client,
)
from profile.db import insert_cv_variant
from profile.prompts import TAILOR_PROMPT
from profile.schemas import CVVariant, MasterProfile, SelectedItem


class TailorValidationError(ValueError):
    """Expose all hallucinated references after the single repair attempt."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("CV variant failed validation: " + "; ".join(errors))


def _validate_selected_items(
    selected: list[SelectedItem],
    master_bullets: dict[str, set[str]],
    item_kind: str,
) -> list[str]:
    errors: list[str] = []
    for item in selected:
        if item.item_id not in master_bullets:
            errors.append(f"Unknown {item_kind} item_id: {item.item_id}")
            continue
        for bullet in item.kept_bullets:
            if bullet not in master_bullets[item.item_id]:
                errors.append(
                    f"Unknown bullet for {item_kind} {item.item_id}: {bullet}"
                )
    return errors


def validate_variant(variant: CVVariant, master: MasterProfile) -> list[str]:
    """Return every broken reference so one retry can repair them together."""
    experience_bullets = {
        experience.id: set(experience.bullets) for experience in master.experiences
    }
    project_bullets = {project.id: set(project.bullets) for project in master.projects}

    errors = _validate_selected_items(
        variant.selected_experiences,
        experience_bullets,
        "experience",
    )
    errors.extend(
        _validate_selected_items(
            variant.selected_projects,
            project_bullets,
            "project",
        )
    )

    master_skills = {skill.name for skill in master.skills}
    for skill in variant.emphasized_skills:
        if skill not in master_skills:
            errors.append(f"Unknown emphasized skill: {skill}")

    master_item_ids = set(experience_bullets) | set(project_bullets)
    for item_id in variant.omitted_notable:
        if item_id not in master_item_ids:
            errors.append(f"Unknown omitted item_id: {item_id}")

    return errors


def _generate_variant(client: StructuredClient, prompt: str) -> CVVariant:
    return cast(
        CVVariant,
        client.chat.completions.create(
            model=MODEL_NAME,
            response_model=CVVariant,
            messages=[{"role": "system", "content": prompt}],
            temperature=MODEL_TEMPERATURE,
            max_retries=MAX_RETRIES,
        ),
    )


def generate_tailored_variant(master: MasterProfile, jd_text: str) -> CVVariant:
    """Select from the master profile against any JD text, with one grounding retry.

    No persistence here — callers that have a real application_id to attach the
    result to should use tailor_cv instead.
    """
    if not jd_text.strip():
        raise ValueError("A non-empty job description is required for tailoring")

    prompt = TAILOR_PROMPT.format(
        master_json=json.dumps(master.model_dump(mode="json"), ensure_ascii=False),
        jd_text=jd_text,
    )
    client = create_structured_client()
    variant = _generate_variant(client, prompt)
    errors = validate_variant(variant, master)

    if errors:
        repair_prompt = prompt + "\n\nVALIDATION ERRORS FROM THE PREVIOUS RESPONSE:\n- "
        repair_prompt += "\n- ".join(errors)
        repair_prompt += (
            "\nReturn a corrected CVVariant using only exact item ids, bullets, and "
            "skill names from the master profile."
        )
        variant = _generate_variant(client, repair_prompt)
        errors = validate_variant(variant, master)

    if errors:
        raise TailorValidationError(errors)

    return variant


def tailor_cv(
    application_id: str,
    master: MasterProfile,
    jd_text: str,
    profile_version: int,
) -> CVVariant:
    """Persist only a variant that survives one explicit grounding retry."""
    if profile_version < 1:
        raise ValueError("profile_version must be at least 1")

    variant = generate_tailored_variant(master, jd_text)

    insert_cv_variant(
        application_id=application_id,
        variant=variant,
        profile_version=profile_version,
    )
    return variant
