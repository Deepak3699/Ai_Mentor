from pydantic import Field

from backend.schemas.lessons import APIRequest


class AssistantHistoryTurn(APIRequest):
    role: str = Field(..., pattern=r"^(user|model)$")
    text: str = Field(..., min_length=1, max_length=2000)


class AssistantRequest(APIRequest):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[AssistantHistoryTurn] = Field(default_factory=list, max_length=20)
    context: str = Field(..., max_length=10000)


class AssistantResponse(APIRequest):
    reply: str = Field(..., min_length=1)
    route: str | None = None
    error: str | None = None
    refused: bool = False