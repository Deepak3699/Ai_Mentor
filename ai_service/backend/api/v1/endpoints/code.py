from fastapi import APIRouter
from backend.schemas.lessons import ExplainCodeRequest
from backend.services.providers import manager as provider_manager

router = APIRouter()


@router.post("/explain-code")
def explain_code(data: ExplainCodeRequest):
    return provider_manager.explain_code(data)
