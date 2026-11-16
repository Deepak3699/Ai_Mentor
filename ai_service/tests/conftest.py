import sys
from pathlib import Path

service_dir = Path(__file__).resolve().parent.parent
backend_dir = service_dir / "backend"
for import_root in (backend_dir, service_dir):
    if str(import_root) not in sys.path:
        sys.path.insert(0, str(import_root))
