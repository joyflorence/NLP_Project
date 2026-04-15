from dotenv import load_dotenv
import os
load_dotenv(".env")
load_dotenv("backend/.env", override=True)
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
from supabase import create_client
client = create_client(url, key)
res = client.table("documents").select("title, uploaded_by").execute()
print(res.data)
