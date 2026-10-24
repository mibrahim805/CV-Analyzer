from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, detail: str, title: str = "Request failed") -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
        self.title = title


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=exc.status_code,
        media_type="application/problem+json",
        content={
            "type": f"https://api.careerpilot.example/problems/{exc.code}",
            "title": exc.title,
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": request.url.path,
            "code": exc.code,
            "request_id": request_id,
            "errors": [],
        },
    )
