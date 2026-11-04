# Phone shell contract (#70, #71)

Applies to the plain phone layout (viewport < 768px) of the public page, the owner/collaborator previews and the phone editor.

* **One return path.** Home shows the site bar (site name + language). Opening an app replaces it: the app's own title bar is the only header — `‹ Desktop`, the app title, a site menu (`⋯`, language and a ♫ indicator while music plays) and close. There is no bottom taskbar and no second site header while an app is open. Escape closes the site menu first, then leaves the app.
* **Editing controls in the title bar.** In the phone editor the edit/finish control sits in the app's title bar instead of floating over the content; the editor toolbar (add / edit / theme / preview) stays at the bottom of the home screen and while an app is open.
* **Touch targets.** Every shell control is at least 44×44px (WindowChrome's mobile presentation provides it).
* **Height and safe area.** The shell is `100dvh` (with a `100vh` fallback). The bottom inset is `--m-safe-bottom` (`env(safe-area-inset-bottom)`, `viewport-fit=cover`), so nothing sits behind the home indicator; tests override the variable to prove it.
* **One scroll area.** The open app's module area scrolls; nested scrollers (music playlist, lyrics) are removed on a phone. The desktop keeps its compact areas.
* **Startup.** A phone starts on the home screen. `defaultOpen` is a desktop-only setting (labelled so in the editor); only a deep link and a character dialog with auto-show open something on start. No new persisted field.
* **Unchanged.** Retro look (gradient title bars, bevels, pixel icons), IG's internal navigation, closing/minimising stops media, the single-audio rule, previews/rotation keep the visitor's place.

Not verified on real devices (iOS Safari toolbar/keyboard, Android): see the PR description.
