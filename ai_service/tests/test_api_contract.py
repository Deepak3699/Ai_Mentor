import ast
from pathlib import Path

API_PATH = Path(__file__).resolve().parents[1] / "backend" / "api.py"
SOURCE = API_PATH.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def class_fields(name):
    node = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == name)
    return {n.target.id for n in node.body if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)}


def route_map():
    routes = {}
    for node in TREE.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
                owner = decorator.func.value
                if isinstance(owner, ast.Name) and owner.id == "app" and decorator.args:
                    value = decorator.args[0]
                    if isinstance(value, ast.Constant) and isinstance(value.value, str):
                        routes[(decorator.func.attr, value.value)] = node.name
    return routes


def test_request_models_expose_required_contract_fields():
    assert {"course", "topic", "celebrity"} <= class_fields("LessonRequest")
    assert {"preferences", "voice_id", "gender", "language", "speech_rate", "speech_pitch"} <= class_fields("LessonRequest")
    assert class_fields("SyllabusRequest") == {"course_title", "category"}
    assert class_fields("QuizRequest") == {"lesson", "difficulty", "weak_topics"}


def test_quiz_response_contract_is_defined():
    assert class_fields("QuizQuestion") == {"question", "options", "correct_index", "explanation", "topic"}
    assert class_fields("QuizResponse") == {"questions"}


def test_public_routes_are_mapped_to_expected_handlers():
    routes = route_map()
    assert routes[("get", "/")] == "home"
    assert routes[("get", "/voices")] == "get_voices"
    assert routes[("post", "/generate-syllabus")] == "generate_syllabus"
    assert routes[("post", "/generate-quiz")] == "generate_quiz"
    assert routes[("post", "/generate")] == "generate_lesson"


def test_job_and_transcript_routes_remain_available():
    routes = route_map()
    assert routes[("get", "/status/{job_id}")] == "get_status"
    assert routes[("get", "/transcript/{filename}")] == "get_transcript"


def test_api_uses_declared_config_model_for_primary_gemini_calls():
    assert "model=GEMINI_MODEL" in SOURCE, "Primary Gemini calls should use the configured GEMINI_MODEL"


def test_api_does_not_embed_secret_values():
    forbidden = ("AIza", "gsk_", "api_key='", 'api_key="')
    assert not any(marker in SOURCE for marker in forbidden)
