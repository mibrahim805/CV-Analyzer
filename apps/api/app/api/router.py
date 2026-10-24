from fastapi import APIRouter

from app.api.routes import auth, cv_documents, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(cv_documents.router)
