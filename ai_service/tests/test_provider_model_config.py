
import importlib
import json
from types import SimpleNamespace

from backend.schemas.lessons import ExplainCodeRequest

gemini_provider = importlib.import_module(
    "backend.services.providers.gemini_provider"
)
groq_provider = importlib.import_module(
    "backend.services.providers.groq_provider"
)


VALID_EXPLANATION = {
    "summary": "A simple example.",
    "explanation": [],
    "issues": [],
    "suggested_code": "",
    "time_complexity": "O(1)",
    "space_complexity": "O(1)",
}


def test_gemini_explain_code_uses_configured_model(monkeypatch):
    expected_model = "custom-gemini-explain-model"
    captured = {}

    class FakeModels:
        def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text=json.dumps(VALID_EXPLANATION))

    fake_client = SimpleNamespace(models=FakeModels())

    monkeypatch.setattr(
        gemini_provider,
        "GEMINI_EXPLAIN_MODEL",
        expected_model,
    )
    monkeypatch.setattr(
        gemini_provider,
        "get_gemini_client",
        lambda: fake_client,
    )

    provider = gemini_provider.GeminiProvider()
    request = ExplainCodeRequest(
        code="print('Hello')",
        language="python",
        mode="explain",
    )

    provider.explain_code(request)

    assert captured["model"] == expected_model


def test_groq_explain_code_uses_configured_model(monkeypatch):
    expected_model = "custom-groq-explain-model"
    captured = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content=json.dumps(VALID_EXPLANATION)
                        )
                    )
                ]
            )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )

    monkeypatch.setattr(
        groq_provider,
        "GROQ_EXPLAIN_MODEL",
        expected_model,
    )
    monkeypatch.setattr(
        groq_provider,
        "get_groq_client",
        lambda: fake_client,
    )

    provider = groq_provider.GroqProvider()
    request = ExplainCodeRequest(
        code="print('Hello')",
        language="python",
        mode="explain",
    )

    provider.explain_code(request)

    assert captured["model"] == expected_model
