#!/usr/bin/env python3
"""Run the FastAPI backend server."""

import sys
from pathlib import Path

# Ensure project root is on path when run from backend/
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
