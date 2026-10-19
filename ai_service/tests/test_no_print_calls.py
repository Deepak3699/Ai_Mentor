import ast
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"


def find_print_calls(source, filename):
    tree = ast.parse(source, filename=filename)
    builtins_aliases = {"builtins"}
    print_aliases = {"print"}

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            builtins_aliases.update(
                alias.asname or alias.name
                for alias in node.names
                if alias.name == "builtins"
            )
        elif isinstance(node, ast.ImportFrom) and node.module == "builtins":
            print_aliases.update(
                alias.asname or alias.name
                for alias in node.names
                if alias.name == "print"
            )

    return [
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (
            isinstance(node.func, ast.Name) and node.func.id in print_aliases
            or isinstance(node.func, ast.Attribute)
            and node.func.attr == "print"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in builtins_aliases
        )
    ]


def test_python_backend_does_not_call_print():
    violations = []
    for path in BACKEND_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        violations.extend(
            f"{path.relative_to(BACKEND_DIR)}:{line}"
            for line in find_print_calls(source, str(path))
        )

    assert not violations, (
        "print() calls found in the Python backend:\n" + "\n".join(violations)
    )


def test_print_guard_ignores_unrelated_methods_and_finds_builtin_calls():
    source = """
import builtins as output

printer.print("not the built-in")
print("built-in")
output.print("built-in alias")
"""
    assert find_print_calls(source, "<test>") == [5, 6]
