export type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_ASSET_BASE_URL: string;
  /** Comma-separated site IDs that may show the Image authoring entry. Unset: everyone (dev/tests). Set, even empty: only the listed sites; "*" lists every site (staging test environment). */
  IMAGE_QA_SITE_IDS?: string;
  ASSETS: R2Bucket;
};
