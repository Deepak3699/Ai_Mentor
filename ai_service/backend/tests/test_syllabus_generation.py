import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import HTTPException

from api import SyllabusRequest, generate_syllabus


VALID_SYLLABUS = {
    "modules": [
        {
            "title": "Module 1",
            "lessons": [
                {"title": "Lesson 1", "duration": "5 mins", "type": "video"},
                {"title": "Lesson 2", "duration": "5 mins", "type": "video"},
            ],
        },
        {
            "title": "Module 2",
            "lessons": [
                {"title": "Lesson 3", "duration": "5 mins", "type": "video"},
                {"title": "Lesson 4", "duration": "5 mins", "type": "video"},
            ],
        },
        {
            "title": "Module 3",
            "lessons": [
                {"title": "Lesson 5", "duration": "5 mins", "type": "video"},
                {"title": "Lesson 6", "duration": "5 mins", "type": "video"},
            ],
        },
    ]
}


class TestGenerateSyllabus(unittest.TestCase):

    def setUp(self):
        self.request = SyllabusRequest(
            course_title="Test Course",
            category="Testing"
        )

    @patch("api.groq_client")
    @patch("api.gemini_client")
    def test_primary_success(self, mock_gemini, mock_groq):
        mock_gemini.models.generate_content.return_value.text = (
            '{"modules": []}'
        )

        result = generate_syllabus(self.request)

        self.assertEqual(result, {"modules": []})
        mock_gemini.models.generate_content.assert_called_once()
        mock_groq.chat.completions.create.assert_not_called()

    @patch("api.groq_client")
    @patch("api.gemini_client")
    def test_fallback_to_groq(self, mock_gemini, mock_groq):
        mock_gemini.models.generate_content.side_effect = Exception(
            "Gemini unavailable"
        )

        mock_groq.chat.completions.create.return_value.choices = [
            Mock(message=Mock(content='{"modules": []}'))
        ]

        result = generate_syllabus(self.request)

        self.assertEqual(result, {"modules": []})
        mock_gemini.models.generate_content.assert_called_once()
        mock_groq.chat.completions.create.assert_called_once()

    @patch("api.groq_client")
    @patch("api.gemini_client")
    def test_invalid_json_falls_back_to_groq(self, mock_gemini, mock_groq):
        mock_gemini.models.generate_content.return_value.text = (
            "not valid json"
        )

        mock_groq.chat.completions.create.return_value.choices = [
            Mock(message=Mock(content='{"modules": []}'))
        ]

        result = generate_syllabus(self.request)

        self.assertEqual(result, {"modules": []})
        mock_groq.chat.completions.create.assert_called_once()

    @patch("api.groq_client")
    @patch("api.gemini_client")
    def test_total_provider_failure_returns_503(self, mock_gemini, mock_groq):
        mock_gemini.models.generate_content.side_effect = Exception(
            "Gemini unavailable"
        )
        mock_groq.chat.completions.create.side_effect = Exception(
            "Groq unavailable"
        )

        with self.assertRaises(HTTPException) as context:
            generate_syllabus(self.request)

        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(
            context.exception.detail,
            "Failed to generate syllabus"
        )


if __name__ == "__main__":
    unittest.main()
