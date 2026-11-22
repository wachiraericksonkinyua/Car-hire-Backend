import pytest

from scripts.seed_owner import _initial_password


def test_initial_password_requires_explicit_secret(monkeypatch):
    monkeypatch.delenv("OWNER_DEFAULT_PASSWORD", raising=False)

    with pytest.raises(RuntimeError, match="OWNER_DEFAULT_PASSWORD"):
        _initial_password()


def test_initial_password_rejects_short_secret(monkeypatch):
    monkeypatch.setenv("OWNER_DEFAULT_PASSWORD", "too-short")

    with pytest.raises(RuntimeError, match="12 characters"):
        _initial_password()


def test_initial_password_rejects_whitespace(monkeypatch):
    monkeypatch.setenv("OWNER_DEFAULT_PASSWORD", " " * 16)

    with pytest.raises(RuntimeError, match="12 characters"):
        _initial_password()


def test_initial_password_uses_configured_secret(monkeypatch):
    monkeypatch.setenv("OWNER_DEFAULT_PASSWORD", "a-strong-secret-longer")

    assert _initial_password() == "a-strong-secret-longer"
