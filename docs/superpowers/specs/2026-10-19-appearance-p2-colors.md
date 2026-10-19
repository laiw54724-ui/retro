# Issue 35: bounded P2 colors

Base: reviewed #89, 7070296b231a021f5e8cad77013abadbab305956. P1 is already merged through #38/#65. No wallpaper, fonts, geometry, templates, taskbar or per-module style expansion.

## Contract and scope

Add optional validated hex fields titleText, frameColor, contentBackground, contentText, desktopLabelText, desktopLabelBackground on theme.appearance and window.appearance. Keep existing titleFrom/titleTo/titleGradient on window.appearance, now optional per field; absent gradient retains the existing chrome-preset/title-override defaults, resolved without writing defaults. Missing values inherit window → site → module/theme defaults. Title text override applies to active titles; inactive retains the existing focus rule. Frame controls derive readable foreground and bevel from a custom face locally. Label background is opaque when specified; absence inherits the site/style rule. No extra title/name field.

Content colors apply to document/gallery/links surfaces and prose/captions. Links retain explicit tile colors and document headings/links retain their semantic colors. Other modules keep their existing content defaults and explicit author colors; per-window content controls are hidden for them and site controls explain this bounded scope. No OC, Moodboard or module-content schema changes.

Shared pure resolvers feed desktop/mobile/public/preview and scoped CSS variables. No global theme variables or changes to adjacent windows/editor panels.

## Delivery and compatibility

Reader branch codex/appearance-p2-reader-35 adds contract, resolvers, rendering, tests; no author controls emitting new fields. Old strict v2 readers reject the fields; old v1 nested parsers can strip them. Neither is a safe rollback after writes. Deploy compatible API validation/publish/export and every web reader first, including stale-editor handling, then verify save/reload/public/export roundtrip on the deployed versions before allowing writers. No deployment in this task.

Writer follow-up branches from the reader head and requires it exactly. Controls require local development plus VITE_APPEARANCE_P2_WRITER=true, default off. Production stays hard off until the API/client preservation handshake in the compatibility-guard spec is implemented. Release owner must prove deployment compatibility and old editor exclusion before enabling the build flag. Flag is a rollout guard, not authorization or a schema security boundary. Existing fields remain editable. Every window color editor has local preview, cancel and one apply transaction, per-field inherit/reset and full reset. Existing title reset only clears title fields. Presets retain window overrides.

Contrast warnings show minimum sampled title contrast across the gradient (4.5 threshold), body pair and labels only when known. Wallpaper images/patterns require visual checking unless an opaque label background is present; no arbitrary-wallpaper compliance claim. Manual low contrast remains allowed.

## Verification

Old/new strict schema, invalid/unknown keys, no default freezing, migration/view merge/reload, public projection and both export scopes. Resolver isolation and author color precedence. Focused Chromium checks at 320/390/430 and desktop for two windows, editor/preview/public and draft/apply/cancel/reset/undo. No Safari/real-device or deployment claims.
