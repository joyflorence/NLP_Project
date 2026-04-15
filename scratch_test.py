import os
import sys
from pathlib import Path
from dotenv import load_dotenv

_ROOT_ENV = Path("d:/NLP_Project_1/.env")
_BACKEND_ENV = Path("d:/NLP_Project_1/backend/.env")
load_dotenv(_ROOT_ENV)
load_dotenv(_BACKEND_ENV, override=True)

from supabase import create_client

url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("MISSING KEYS")
    sys.exit(1)

client = create_client(url, key)

try:
    users = client.auth.admin.list_users()
    print("Users length:", len(users))
    for u in users[:2]:
        print(u)
except Exception as e:
    print("Error:", str(e))
