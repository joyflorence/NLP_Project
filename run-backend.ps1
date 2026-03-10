# Run the backend using the project's venv (avoids "No module named 'fastapi'" when system Python is used)
Set-Location $PSScriptRoot
& .\.venv\Scripts\python.exe backend\run.py
