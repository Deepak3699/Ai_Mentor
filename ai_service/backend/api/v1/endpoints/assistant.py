from fastapi import APIRouter, Depends

from backend.schemas.assistant import AssistantRequest, AssistantResponse
from backend.services.assistant_service import generate_assistant_response
from backend.utils.service_auth import verify_service_key

router = APIRouter()


@router.post(
    "/assistant/chat",
    response_model=AssistantResponse,
    dependencies=[Depends(verify_service_key)],
)
def assistant_chat(data: AssistantRequest):
    return generate_assistant_response(data)