from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_csrf
from app.api.problems import AppError
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    PreferencesResponse,
    UpdatePreferencesRequest,
    UpdateProfileRequest,
    UserResponse,
)

router = APIRouter(prefix="/users/me", tags=["users"], dependencies=[Depends(require_csrf)])


@router.get("", response_model=UserResponse)
async def current_user(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=UserResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user.profile, field, value)
    await db.commit()
    await db.refresh(user.profile)
    return user


@router.get("/preferences", response_model=PreferencesResponse)
async def preferences(user: User = Depends(get_current_user)) -> object:
    return user.preferences


@router.put("/preferences", response_model=PreferencesResponse)
async def update_preferences(
    payload: UpdatePreferencesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> object:
    if (
        payload.salary_min_minor is not None
        and payload.salary_max_minor is not None
        and payload.salary_min_minor > payload.salary_max_minor
    ):
        raise AppError(422, "invalid_salary_range", "Minimum salary cannot exceed maximum salary.", "Validation failed")
    for field, value in payload.model_dump().items():
        setattr(user.preferences, field, value)
    await db.commit()
    await db.refresh(user.preferences)
    return user.preferences
