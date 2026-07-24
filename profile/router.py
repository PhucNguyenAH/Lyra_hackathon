"""FastAPI boundary for profile uploads, edits, tailoring, and variant history."""

from io import BytesIO
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, status
from markitdown import MarkItDown, MarkItDownException
from pydantic import BaseModel, Field

from profile.db import (
    ProfileNotFoundError,
    ProfileVersionConflictError,
    delete_cv_upload,
    get_application_jd,
    get_master_for_user,
    get_or_create_profile,
    get_profile,
    list_cv_uploads,
    list_cv_variants,
    save_master,
    save_preferences,
)
from profile.ingest import ingest_cv
from profile.schemas import CandidatePreferences, CVVariant, MasterProfile, ProfileRecord
from profile.tailor import TailorValidationError, generate_tailored_variant, tailor_cv


class TailorPreviewRequest(BaseModel):
    """A one-off tailoring request against arbitrary JD text, no application_id needed."""

    jd_text: str = Field(min_length=1, max_length=20_000)


API_PREFIX = "/profile"
PDF_CONTENT_TYPE = "application/pdf"
TEXT_CONTENT_TYPES = frozenset({"text/plain", "text/txt"})

router = APIRouter(tags=["profile"])


def get_current_user_id(
    x_user_id: Annotated[str, Header(alias="X-User-ID")],
) -> str:
    """Keep temporary identity plumbing isolated for a later JWT replacement."""
    user_id = x_user_id.strip()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-User-ID must not be blank",
        )
    return user_id


def _profile_error(error: Exception) -> HTTPException:
    if isinstance(error, ProfileNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload a CV first",
        )
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))


def _extract_upload_text(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    content_type = (file.content_type or "").lower()
    payload = file.file.read()

    if suffix == ".pdf" and content_type == PDF_CONTENT_TYPE:
        try:
            text = MarkItDown(enable_plugins=False).convert_stream(
                BytesIO(payload),
                file_extension=".pdf",
            ).text_content
        except (MarkItDownException, ValueError) as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The PDF could not be converted to Markdown",
            ) from error
    elif suffix == ".txt" and content_type in TEXT_CONTENT_TYPES:
        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Text uploads must be UTF-8 encoded",
            ) from error
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF and TXT files are supported",
        )

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded CV contains no extractable text",
        )
    return text


@router.post(f"{API_PREFIX}/upload", response_model=ProfileRecord)
def upload_profile(
    file: Annotated[UploadFile, File()],
    label: Annotated[str, Form()],
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> ProfileRecord:
    raw_text = _extract_upload_text(file)
    profile = get_or_create_profile(user_id)
    try:
        ingest_cv(profile.id, raw_text, label)
        return get_profile(profile.id)
    except ProfileVersionConflictError as error:
        raise _profile_error(error) from error


@router.get(API_PREFIX, response_model=ProfileRecord)
def read_profile(
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> ProfileRecord:
    try:
        return get_master_for_user(user_id)
    except ProfileNotFoundError as error:
        raise _profile_error(error) from error


@router.patch(API_PREFIX, response_model=ProfileRecord)
def update_profile(
    master: MasterProfile,
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> ProfileRecord:
    try:
        current = get_master_for_user(user_id)
        return save_master(current.id, master, current.version)
    except (ProfileNotFoundError, ProfileVersionConflictError) as error:
        raise _profile_error(error) from error


@router.patch(f"{API_PREFIX}/preferences", response_model=ProfileRecord)
def update_preferences(
    preferences: CandidatePreferences,
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> ProfileRecord:
    try:
        profile = get_master_for_user(user_id)
        return save_preferences(profile.id, preferences)
    except ProfileNotFoundError as error:
        raise _profile_error(error) from error


@router.get(f"{API_PREFIX}/uploads")
def read_cv_uploads(
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> list[dict[str, str]]:
    try:
        profile = get_master_for_user(user_id)
        return list_cv_uploads(profile.id)
    except ProfileNotFoundError as error:
        raise _profile_error(error) from error


@router.delete(f"{API_PREFIX}/uploads/{{upload_id}}", status_code=status.HTTP_204_NO_CONTENT)
def remove_cv_upload(
    upload_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> None:
    try:
        profile = get_master_for_user(user_id)
    except ProfileNotFoundError as error:
        raise _profile_error(error) from error
    if not delete_cv_upload(profile.id, upload_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="CV upload not found",
        )


@router.post("/applications/{application_id}/tailor", response_model=CVVariant)
def tailor_application(
    application_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> CVVariant:
    try:
        profile = get_master_for_user(user_id)
        jd_text = get_application_jd(application_id)
        return tailor_cv(
            application_id,
            profile.master,
            jd_text,
            profile.version,
        )
    except ProfileNotFoundError as error:
        raise _profile_error(error) from error
    except LookupError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(error),
        ) from error
    except TailorValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": str(error), "errors": error.errors},
        ) from error


@router.post(f"{API_PREFIX}/tailor-preview", response_model=CVVariant)
def tailor_preview(
    request: TailorPreviewRequest,
    user_id: Annotated[str, Depends(get_current_user_id)],
) -> CVVariant:
    """Tailor against any job text directly — no seeded application row required."""
    try:
        profile = get_master_for_user(user_id)
        return generate_tailored_variant(profile.master, request.jd_text)
    except ProfileNotFoundError as error:
        raise _profile_error(error) from error
    except TailorValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"message": str(error), "errors": error.errors},
        ) from error


@router.get("/applications/{application_id}/variants")
def read_application_variants(
    application_id: str,
    _user_id: Annotated[str, Depends(get_current_user_id)],
) -> list[dict[str, object]]:
    return list_cv_variants(application_id)


def configure_profile(app: FastAPI) -> None:
    app.include_router(router)
