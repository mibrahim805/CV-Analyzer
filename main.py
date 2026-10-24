"""Developer convenience entry point.

The production ASGI application lives in ``apps/api/app/main.py``. Prefer the
documented uvicorn command; this file keeps IDE run actions useful.
"""

from pathlib import Path
import sys

API_ROOT = Path(__file__).parent / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.main import app  # noqa: E402,F401


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", app_dir=str(API_ROOT), host="127.0.0.1", port=8000, reload=True)
