"""Smoke-test the OpenAI-compatible endpoint configured in the project root.

Run from the repository root:

    apps/api/.venv/bin/python test_open_ai.py

The script loads the root ``.env``, sends one short request, never prints the
API key, and exits non-zero for missing configuration or provider failures.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import httpx

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "apps" / "api"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings  # noqa: E402


def _error_message(response: httpx.Response) -> str:
    """Extract a concise provider error without echoing request credentials."""
    try:
        payload = response.json()
    except ValueError:
        return response.reason_phrase or "The provider returned an invalid error response."
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        if isinstance(payload.get("message"), str):
            return payload["message"]
    return response.reason_phrase or "The provider rejected the request."


def main() -> int:
    if settings.AI_PROVIDER != "openai_compatible":
        print("AI_PROVIDER is not set to openai_compatible; no provider request was made.")
        return 2
    if not settings.AI_API_KEY:
        print("AI_API_KEY is missing from the root environment file.")
        return 2
    if not settings.AI_MODEL_NAME:
        print("AI_MODEL_NAME is missing from the root environment file.")
        return 2

    request_body = {
        "model": settings.AI_MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": "Reply with exactly: CareerPilot OpenAI connection OK.",
            }
        ],
    }

    try:
        with httpx.Client(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            response = client.post(
                settings.AI_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.AI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
            payload: Any = response.json()
    except httpx.TimeoutException:
        print(f"OpenAI request timed out after {settings.AI_TIMEOUT_SECONDS:g} seconds.")
        return 3
    except httpx.HTTPStatusError as exc:
        print(f"OpenAI request failed with HTTP {exc.response.status_code}: {_error_message(exc.response)}")
        return 4
    except httpx.HTTPError as exc:
        print(f"Could not reach the OpenAI endpoint: {exc}")
        return 5
    except ValueError:
        print("The OpenAI endpoint returned invalid JSON.")
        return 6

    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        print("The OpenAI response did not contain choices[0].message.content.")
        return 6
    if not isinstance(content, str) or not content.strip():
        print("The OpenAI response contained an empty message.")
        return 6

    print("OpenAI connection succeeded.")
    print(f"Model: {settings.AI_MODEL_NAME}")
    print(f"Response: {content.strip()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
