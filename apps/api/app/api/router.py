from fastapi import APIRouter

from app.api.routes import auth, cv_documents, interviews, jobs, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(cv_documents.router)
api_router.include_router(jobs.router)
api_router.include_router(interviews.router)
