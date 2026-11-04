# Document inline editor translation delta

Merge each locale JSON's `document.inline` object into the matching shared `modules.json` during integration. Existing document keys remain unchanged. These four files contain the same 11 new keys.

The document module uses these files as a local fallback until the shared catalog keys exist. Shared catalog values take precedence. This does not mutate global i18n resources or change loader/build configuration. Keep the fallback files in this PR so the branch remains usable before integration.

Japanese and Korean use the application's existing locale availability rules; these files do not enable either locale. Native-speaker review remains a separate release check.
