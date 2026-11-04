# About locale additions

Deep-merge each language's `about.inline` object into the matching shared `modules.json` during integration. These files are data for the locale owner, not an additional runtime loader. Existing keys remain intact and are used as translated fallbacks until integration. Do not ship the combined release without merging these deltas.

The about-only PR deliberately does not edit the shared catalogs or i18n loader.
