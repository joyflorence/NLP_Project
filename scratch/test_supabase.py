from dotenv import load_dotenv
import os
load_dotenv(".env")
load_dotenv("backend/.env", override=True)
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
from supabase import create_client
client = create_client(url, key)
users_resp = client.auth.admin.list_users()
users = getattr(users_resp, "users", []) if hasattr(users_resp, "users") else (users_resp if isinstance(users_resp, list) else [])
for u in users[:2]:
    print(u)
    print("EMAIL:", getattr(u, "email", "NO_EMAIL"))
    print("ID:", getattr(u, "id", "NO_ID"))
