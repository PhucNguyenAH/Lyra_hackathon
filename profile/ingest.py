"""Extract and merge uploads without losing their standalone provenance."""

import json
from typing import cast

from interview.llm import (
    MAX_RETRIES,
    MODEL_NAME,
    MODEL_TEMPERATURE,
    create_structured_client,
)
from profile.db import get_profile, insert_cv_upload, save_master
from profile.prompts import EXTRACT_PROMPT, MERGE_PROMPT
from profile.schemas import MasterProfile


def ingest_cv(profile_id: str, raw_text: str, label: str) -> MasterProfile:
    """Keep upload provenance separate so a damaged merge can be reconstructed."""
    if not raw_text.strip():
        raise ValueError("A non-empty CV is required for ingestion")

    current = get_profile(profile_id)
    client = create_structured_client()

    extracted = cast(
        MasterProfile,
        client.chat.completions.create(
            model=MODEL_NAME,
            response_model=MasterProfile,
            messages=[
                {
                    "role": "system",
                    "content": EXTRACT_PROMPT.format(cv_raw=raw_text),
                }
            ],
            temperature=MODEL_TEMPERATURE,
            max_retries=MAX_RETRIES,
        ),
    )

    merged = cast(
        MasterProfile,
        client.chat.completions.create(
            model=MODEL_NAME,
            response_model=MasterProfile,
            messages=[
                {
                    "role": "system",
                    "content": MERGE_PROMPT.format(
                        master_json=json.dumps(
                            current.master.model_dump(mode="json"),
                            ensure_ascii=False,
                        ),
                        extracted_json=json.dumps(
                            extracted.model_dump(mode="json"),
                            ensure_ascii=False,
                        ),
                    ),
                }
            ],
            temperature=MODEL_TEMPERATURE,
            max_retries=MAX_RETRIES,
        ),
    )

    insert_cv_upload(
        profile_id=profile_id,
        raw_text=raw_text,
        label=label,
        extracted=extracted,
    )
    save_master(
        profile_id=profile_id,
        master=merged,
        expected_version=current.version,
    )
    return merged
