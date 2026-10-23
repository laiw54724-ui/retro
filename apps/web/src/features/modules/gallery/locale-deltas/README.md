# Gallery locale increments

Deep-merge each language JSON into the corresponding `i18n/locales/<language>/modules.json` during the shared locale integration. These files add only `gallery.inline.*`; do not replace or remove the existing `gallery` keys. The gallery code falls back to existing catalog keys until integration. No runtime loader changes are included.

The dedicated browser fixture injects these exact deltas into its mocked local session to verify the integrated wording. The existing media regression suite runs without injection, covering the pre-integration fallback.

The URL copy intentionally says HTTPS: the shared `normalizeImageUrl` contract rejects HTTP and uses the existing Google Drive thumbnail normalization. This module preserves that contract.
