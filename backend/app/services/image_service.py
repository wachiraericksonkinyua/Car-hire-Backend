"""Small helper for validating and storing uploaded profile images."""

from pathlib import Path

from fastapi import HTTPException, UploadFile, status

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"

_ALLOWED = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024


async def read_image(file: UploadFile) -> tuple[bytes, str]:
    """Validate and read an uploaded profile image for database storage."""
    content_type = file.content_type or ""
    if content_type not in _ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPG, PNG or WebP images are allowed",
        )

    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Each image must be 5 MB or smaller",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded image is empty",
        )

    return content, content_type


def delete_image_file(url: str | None) -> None:
    """Best-effort removal of a locally stored image."""
    if not url or "/uploads/" not in url:
        return
    relative = url.split("/uploads/", 1)[1]
    target = (UPLOAD_ROOT / relative).resolve()
    try:
        target.relative_to(UPLOAD_ROOT.resolve())
    except ValueError:
        return
    target.unlink(missing_ok=True)
