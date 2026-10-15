# Window Appearance, Win98 IG, Icon Library, and Cubic 11 Design

## Goal

Extend Retro Desktop's existing visual system without replacing it: each window can override its title bar, Instagram can switch between modern and Win98 skins with Win98 as the default, the supplied Windows 98 PNG library becomes searchable, and every Chinese and English UI surface renders with Cubic 11.

## Window title-bar appearance

Each desktop window gains an optional `appearance` object with `titleFrom`, `titleTo`, and `titleGradient`. Absence means “follow the current site theme.” The inspector's Layout tab exposes a follow-theme/custom toggle, two colour inputs, a gradient checkbox, a live preview, and a reset action. When gradient is disabled, only `titleFrom` is rendered; `titleTo` remains stored so re-enabling the gradient restores the previous choice.

The override applies to editor canvas, visitor desktop, preview, and mobile window chrome. Inactive title bars keep the existing inactive treatment so focus remains legible. Text colour is calculated from the start colour for contrast.

## Instagram skins

Instagram content gains `skin: "win98" | "modern"`. Missing values in stored documents normalize to `win98`, so existing and newly created Instagram windows use Win98 automatically. The inline editor presents a Win98/Modern segmented control near the existing edit/preview modes.

Both skins use the same data and session state. Win98 changes only presentation: grey panel surfaces, raised and sunken controls, square profile layout, Win98-style tabs and navigation buttons, and pixel icon treatment inspired by the supplied reference. Follow, likes, comments, stories, saved posts, post navigation, keyboard scrolling, and internal scroll ownership remain unchanged.

## Windows 98 icon library

Only PNG assets from the user-supplied `windows98-icons/png` directory are shipped. `.ico`, `.ani`, `.icl`, and metadata files are excluded. A generated TypeScript manifest maps a stable icon key to its public path and searchable filename tokens.

The picker initially renders about 120 curated, broadly useful icons. A search field queries all 1,758 PNG records locally and renders at most the first 100 matches; image files load only for visible results. Existing built-in SVG icons and user-uploaded icons remain available. Missing static assets fall back to the existing document icon rather than displaying a broken image.

The source folder has no bundled provenance document. The assets are treated as user-provided project inputs; no ownership claim is added by the application.

## Typography

The repository already contains `Cubic_11.woff2` and its OFL file. Cubic 11 becomes the first font for every application, editor, visitor, Instagram, button, form, and mobile surface. Existing theme font fields remain in the schema for document compatibility, but rendering no longer allows them or Pixelify-specific rules to override Cubic 11. A system sans-serif fallback remains so text stays visible if the webfont fails.

The font continues to use `font-display: swap`, is preloaded from the same origin, and ships with `apps/web/public/fonts/OFL.txt` as required by SIL OFL 1.1.

## Compatibility and failure handling

- Legacy windows without `appearance` inherit the theme.
- Legacy Instagram content without `skin` normalizes to `win98`.
- Unknown skin values fail schema validation rather than silently producing an undefined layout.
- Unknown or missing Win98 icons fall back to `doc`.
- Search is capped to 100 rendered results and does not download the complete library up front.
- No API or database migration is required because documents remain JSON and schema defaults handle upgrades.

## Verification

Unit tests cover legacy normalization, new defaults, and appearance schema validation. E2E tests cover per-window gradient and solid title bars, inheritance reset, Instagram skin switching and scroll behavior, curated/search icon selection, missing-icon fallback, and computed Cubic 11 typography on desktop and mobile. Final verification runs typecheck, lint, unit tests, the complete Playwright suite, production build, a bounded phone/tablet/desktop visual pass, and staging smoke tests.

