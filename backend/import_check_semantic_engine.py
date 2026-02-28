import traceback
import importlib.util
import sys
from pathlib import Path


def try_import(path: Path) -> int:
    print(f"Trying import from: {path}")
    try:
        spec = importlib.util.spec_from_file_location("semantic_engine", str(path))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        print("IMPORT_OK")
        return 0
    except Exception:
        print("IMPORT_ERROR")
        traceback.print_exc()
        return 1


def main():
    root = Path(__file__).resolve().parent.parent
    matches = list(root.rglob("semantic_engine.py"))
    if not matches:
        print("No semantic_engine.py files found in repository.")
        sys.exit(3)

    exit_codes = []
    for p in matches:
        exit_codes.append(try_import(p))

    if any(code != 0 for code in exit_codes):
        sys.exit(2)


if __name__ == "__main__":
    main()
