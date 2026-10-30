import importlib.util
from pathlib import Path
import sys

_api_file = Path(__file__).resolve().parent.parent / "api.py"
_spec = importlib.util.spec_from_file_location("api", _api_file)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["api"] = _mod
_spec.loader.exec_module(_mod)

for _name, _val in _mod.__dict__.items():
    globals()[_name] = _val

try:
    from backend.api.v1.router import api_v1_router
    globals()["api_v1_router"] = api_v1_router
except Exception:
    pass
