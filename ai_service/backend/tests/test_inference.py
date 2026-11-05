
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError
from api import (
    LessonRequest,
    SyllabusRequest,
    ExplainCodeRequest,
    QuizRequest,
    FlashcardRequest,
)


class TestRequestValidation(unittest.TestCase):

    def test_valid_requests(self):
        requests = [
            LessonRequest(course="AI", topic="Neural networks"),
            SyllabusRequest(course_title="Python"),
            ExplainCodeRequest(
                code="print('Hello')",
                language="python",
                mode="explain",
            ),
            QuizRequest(lesson="Python basics"),
            FlashcardRequest(transcript="Python basics"),
        ]

        self.assertEqual(len(requests), 5)

    def test_rejects_whitespace_only_required_fields(self):
        invalid_requests = [
            (LessonRequest, {"course": "   ", "topic": "Python"}),
            (LessonRequest, {"course": "AI", "topic": "   "}),
            (SyllabusRequest, {"course_title": "   "}),
            (ExplainCodeRequest, {
                "code": "   ",
                "language": "python",
                "mode": "explain",
            }),
            (ExplainCodeRequest, {
                "code": "print(1)",
                "language": "   ",
                "mode": "explain",
            }),
            (QuizRequest, {"lesson": "   "}),
            (FlashcardRequest, {"transcript": "   "}),
        ]

        for model, data in invalid_requests:
            with self.subTest(model=model.__name__, data=data):
                with self.assertRaises(ValidationError):
                    model(**data)

    def test_rejects_unexpected_fields(self):
        invalid_requests = [
            (LessonRequest, {
                "course": "AI",
                "topic": "Neural networks",
                "unexpected": "value",
            }),
            (SyllabusRequest, {
                "course_title": "Python",
                "unexpected": "value",
            }),
            (ExplainCodeRequest, {
                "code": "print(1)",
                "language": "python",
                "mode": "explain",
                "unexpected": "value",
            }),
            (QuizRequest, {
                "lesson": "Python basics",
                "unexpected": "value",
            }),
            (FlashcardRequest, {
                "transcript": "Python basics",
                "unexpected": "value",
            }),
        ]

        for model, data in invalid_requests:
            with self.subTest(model=model.__name__):
                with self.assertRaises(ValidationError):
                    model(**data)

    def test_rejects_blank_optional_fields(self):
        with self.assertRaises(ValidationError):
            LessonRequest(
                course="AI",
                topic="Neural networks",
                language="   ",
            )


if __name__ == "__main__":
    unittest.main()
