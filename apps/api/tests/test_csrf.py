import pytest
from starlette.requests import Request

from app.api.dependencies import require_csrf
from app.api.problems import AppError
from app.core.config import settings


def make_request(method: str, *, cookie: str | None = None, origin: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cookie:
        headers.append((b"cookie", f"csrf_token={cookie}".encode()))
    if origin:
        headers.append((b"origin", origin.encode()))
    return Request({"type": "http", "method": method, "path": "/", "headers": headers})


def test_safe_method_does_not_require_csrf() -> None:
    require_csrf(make_request("GET"), None)


def test_state_change_requires_matching_token() -> None:
    with pytest.raises(AppError) as exc_info:
        require_csrf(make_request("PATCH", cookie="known"), None)
    assert exc_info.value.status_code == 403
    require_csrf(make_request("PATCH", cookie="known", origin=settings.WEB_ORIGIN), "known")


def test_state_change_rejects_untrusted_origin() -> None:
    with pytest.raises(AppError) as exc_info:
        require_csrf(make_request("DELETE", cookie="known", origin="https://attacker.example"), "known")
    assert exc_info.value.status_code == 403


def test_state_change_accepts_any_configured_frontend_origin() -> None:
    alternate_origin = next(origin for origin in settings.CORS_ORIGINS if origin != settings.WEB_ORIGIN)
    require_csrf(make_request("POST", cookie="known", origin=alternate_origin), "known")
