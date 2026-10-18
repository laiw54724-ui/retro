/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_I18N_PREVIEW_LOCALES?: string;
  /** Only when published assets are served from an origin other than `<API>/api/assets`: the API's PUBLIC_ASSET_BASE_URL. */
  readonly VITE_PUBLIC_ASSET_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
