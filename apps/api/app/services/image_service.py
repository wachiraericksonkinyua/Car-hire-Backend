"""Small helper for validating and storing uploaded profile images."""

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, Request, UploadFile, status

UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "uploads"

_ALLOWED = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_BYTES = 5 * 1024 * 1024


async def store_image(
    file: UploadFile,
    *,
    request: Request,
    folder: str,
    owner_id: UUID,
) -> str:
    """Validate an image upload, save it, and return its public URL."""
    extension = _ALLOWED.get(file.content_type or "")
    if extension is None:
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

    target_dir = UPLOAD_ROOT / folder / str(owner_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.{extension}"
    (target_dir / filename).write_bytes(content)

    return (
        f"{request.base_url}uploads/{folder}/{owner_id}/{filename}"
    )


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
