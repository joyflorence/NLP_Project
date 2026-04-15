/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AUTH_TOKEN_KEY?: string
  readonly VITE_API_KEY?: string
  readonly VITE_USE_MOCK_API?: string
  readonly VITE_PASSWORD_RESET_REDIRECT_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}