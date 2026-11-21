"""SMS notifications (Africa's Talking).

Best-effort only: a failed SMS must never fail a booking or assignment.
Without credentials configured, this is a no-op.
"""

import logging

import httpx

from app.core.config import get_settings
from app.utils.phone import mask_phone, normalize_kenyan_phone

logger = logging.getLogger("autohire.notifications")

AFRICASTALKING_URL = (
    "https://api.africastalking.com/version1/messaging"
)


async def send_sms(phone: str, message: str) -> bool:
    settings = get_settings()
    if not (
        settings.AFRICASTALKING_USERNAME
        and settings.AFRICASTALKING_API_KEY
    ):
        return False

    try:
        recipient = normalize_kenyan_phone(phone)
        headers = {
            "apiKey": settings.AFRICASTALKING_API_KEY,
            "Accept": "application/json",
        }
        data = {
            "username": settings.AFRICASTALKING_USERNAME,
            "to": f"+{recipient}",
            "message": message,
        }
        if settings.AFRICASTALKING_SENDER_ID:
            data["from"] = settings.AFRICASTALKING_SENDER_ID

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                AFRICASTALKING_URL, headers=headers, data=data
            )
            response.raise_for_status()
        return True
    except Exception:
        logger.warning(
            "SMS delivery failed for %s",
            mask_phone(phone),
            exc_info=False,
        )
        return False
