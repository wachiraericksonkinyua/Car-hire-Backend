"""Kenyan phone number normalisation.

Accepted inputs: 07XXXXXXXX, 01XXXXXXXX, 7XXXXXXXX, 1XXXXXXXX,
+2547XXXXXXXX, +2541XXXXXXXX and 2547XXXXXXXX / 2541XXXXXXXX.

Output: 2547XXXXXXXX or 2541XXXXXXXX.
"""

import re

_WHITESPACE = re.compile(r"[\s\-()]+")


def normalize_kenyan_phone(raw: str) -> str:
    """Return the canonical 2547XXXXXXXX / 2541XXXXXXXX form.

    Raises ValueError for anything that is not a valid Kenyan mobile number.
    """
    cleaned = _WHITESPACE.sub("", raw.strip())
    digits = cleaned.lstrip("+")

    if not digits.isdigit():
        raise ValueError("Phone number must contain digits only")

    if digits.startswith("254"):
        local = digits[3:]
    elif digits.startswith("0"):
        local = digits[1:]
    else:
        local = digits

    if len(local) != 9 or local[0] not in {"7", "1"}:
        raise ValueError(
            "Phone number must be a Kenyan mobile number "
            "(e.g. 0712 345 678 or 0112 345 678)"
        )

    return f"254{local}"


def mask_phone(value: str | None) -> str | None:
    """Mask a phone number for logs/UI: 2547 XXX 678."""
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) < 7:
        return "***"
    return f"{digits[:4]} XXX {digits[-3:]}"
