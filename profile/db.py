"""Thin Supabase persistence with explicit missing-row and version-conflict signals."""

import os
from collections.abc import Mapping
from datetime import datetime, timezone

from supabase import Client, create_client

from profile.schemas import CVVariant, MasterProfile, ProfileRecord


PROFILES_TABLE = "profiles"
CV_UPLOADS_TABLE = "cv_uploads"
CV_VARIANTS_TABLE = "cv_variants"


class ProfileNotFoundError(LookupError):
    """Distinguish a missing profile from a valid empty master."""


class ProfileVersionConflictError(RuntimeError):
    """Reject writes based on a master that another request already replaced."""


def _required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _get_client() -> Client:
    return create_client(
        _required_environment("SUPABASE_URL"),
        _required_environment("SUPABASE_SERVICE_ROLE_KEY"),
    )


def _single_row(data: object) -> dict[str, object] | None:
    if not isinstance(data, list) or not data or not isinstance(data[0], Mapping):
        return None
    return dict(data[0])


def _profile_record(row: Mapping[str, object]) -> ProfileRecord:
    payload = dict(row)
    payload["master"] = payload.get("master") or MasterProfile.empty().model_dump(
        mode="json"
    )
    return ProfileRecord.model_validate(payload)


def get_profile(profile_id: str) -> ProfileRecord:
    response = (
        _get_client()
        .table(PROFILES_TABLE)
        .select("id,user_id,master,version")
        .eq("id", profile_id)
        .limit(1)
        .execute()
    )
    row = _single_row(response.data)
    if row is None:
        raise ProfileNotFoundError(profile_id)
    return _profile_record(row)


def get_or_create_profile(user_id: str) -> ProfileRecord:
    client = _get_client()
    response = (
        client.table(PROFILES_TABLE)
        .select("id,user_id,master,version")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = _single_row(response.data)
    if row is not None:
        return _profile_record(row)

    response = (
        client.table(PROFILES_TABLE)
        .insert(
            {
                "user_id": user_id,
                "master": MasterProfile.empty().model_dump(mode="json"),
                "version": 1,
            }
        )
        .execute()
    )
    row = _single_row(response.data)
    if row is None:
        raise RuntimeError("Supabase did not return the created profile")
    return _profile_record(row)


def save_master(
    profile_id: str,
    master: MasterProfile,
    expected_version: int,
) -> ProfileRecord:
    response = (
        _get_client()
        .table(PROFILES_TABLE)
        .update(
            {
                "master": master.model_dump(mode="json"),
                "version": expected_version + 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", profile_id)
        .eq("version", expected_version)
        .execute()
    )
    row = _single_row(response.data)
    if row is None:
        raise ProfileVersionConflictError(
            f"Profile {profile_id} is no longer at version {expected_version}"
        )
    return _profile_record(row)


def insert_cv_upload(
    profile_id: str,
    raw_text: str,
    label: str,
    extracted: MasterProfile,
) -> None:
    _get_client().table(CV_UPLOADS_TABLE).insert(
        {
            "profile_id": profile_id,
            "raw_text": raw_text,
            "label": label,
            "extracted": extracted.model_dump(mode="json"),
        }
    ).execute()


def insert_cv_variant(
    application_id: str,
    variant: CVVariant,
    profile_version: int,
) -> None:
    content = variant.model_dump(mode="json", exclude={"rationale"})
    _get_client().table(CV_VARIANTS_TABLE).insert(
        {
            "application_id": application_id,
            "profile_version": profile_version,
            "content": content,
            "rationale": variant.rationale,
        }
    ).execute()


def get_master_for_user(user_id: str) -> ProfileRecord:
    response = (
        _get_client()
        .table(PROFILES_TABLE)
        .select("id,user_id,master,version")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    row = _single_row(response.data)
    if row is None:
        raise ProfileNotFoundError(user_id)
    return _profile_record(row)


def get_application_jd(application_id: str) -> str:
    response = (
        _get_client()
        .table("applications")
        .select("jobs(description)")
        .eq("id", application_id)
        .limit(1)
        .execute()
    )
    row = _single_row(response.data)
    job = row.get("jobs") if row else None
    description = job.get("description") if isinstance(job, Mapping) else None
    jd_text = str(description or "").strip()
    if not jd_text:
        raise LookupError(f"No job description found for application {application_id}")
    return jd_text


def list_cv_variants(application_id: str) -> list[dict[str, object]]:
    response = (
        _get_client()
        .table(CV_VARIANTS_TABLE)
        .select("id,application_id,profile_version,content,rationale,created_at")
        .eq("application_id", application_id)
        .order("created_at", desc=True)
        .execute()
    )
    rows = response.data if isinstance(response.data, list) else []
    variants: list[dict[str, object]] = []
    for raw_row in rows:
        if not isinstance(raw_row, Mapping):
            continue
        row = dict(raw_row)
        content = row.get("content")
        if not isinstance(content, Mapping):
            continue
        variant_payload = dict(content)
        variant_payload["rationale"] = row.get("rationale")
        variants.append(
            {
                "id": str(row["id"]),
                "application_id": str(row["application_id"]),
                "profile_version": int(row["profile_version"]),
                "variant": CVVariant.model_validate(variant_payload),
                "created_at": str(row["created_at"]),
            }
        )
    return variants
