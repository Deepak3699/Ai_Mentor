from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class ProviderScriptResult(BaseModel):
    script: str
    provider: str
    model: str


class CodeExplanationLine(BaseModel):
    line: int
    code: str
    explanation: str


class CodeIssue(BaseModel):
    line: int
    problem: str
    suggestion: str


class CodeExplanationResponse(BaseModel):
    summary: str
    explanation: list[CodeExplanationLine] = Field(default_factory=list)
    issues: list[CodeIssue] = Field(default_factory=list)
    suggested_code: str = ""
    time_complexity: str = "not applicable"
    space_complexity: str = "not applicable"


class SyllabusLesson(BaseModel):
    title: str
    duration: str = "5 mins"
    type: str = "video"


class SyllabusModule(BaseModel):
    title: str
    lessons: list[SyllabusLesson]


class SyllabusResponse(BaseModel):
    modules: list[SyllabusModule]
