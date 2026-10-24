import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError
from api import InferenceRequest


class TestInferenceRequest(unittest.TestCase):

    def test_valid_prompt(self):
        request = InferenceRequest(prompt="Explain Python")
        self.assertEqual(request.prompt, "Explain Python")

    def test_missing_prompt(self):
        with self.assertRaises(ValidationError):
            InferenceRequest()

    def test_null_prompt(self):
        with self.assertRaises(ValidationError):
            InferenceRequest(prompt=None)

    def test_empty_prompt(self):
        with self.assertRaises(ValidationError):
            InferenceRequest(prompt="")

    def test_whitespace_prompt(self):
        with self.assertRaises(ValidationError):
            InferenceRequest(prompt="   ")


if __name__ == "__main__":
    unittest.main()