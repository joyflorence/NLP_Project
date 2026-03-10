#!/usr/bin/env python3
"""Run the FastAPI backend server."""

import os
import sys
from pathlib import Path

# Ensure project root is on path when run from backend/
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Set to True for dev; False avoids spawn issues on some Windows setups
    )
