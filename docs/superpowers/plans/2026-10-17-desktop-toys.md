# #25A serverless desktop toys

Implement two registry-native apps whose visitor state never enters the site draft:

- Minesweeper with first-click safety, explicit restart, keyboard arrows/reveal/flag, mobile flag mode, elapsed timer cleanup and reduced-motion-safe presentation.
- Character popup with authored plain text, optional uploaded image and safe link. Automatic opening is opt-in and occurs at most once per page session; visitors can always close it.

Both apps use the existing window lifecycle and theme tokens. No leaderboard, analytics, public submission or guestbook endpoint is introduced. #25B remains a separate moderated-UGC/security milestone.

Focused verification covers pure game rules, no draft writes during visitor play, timer cleanup through unmount, keyboard/mobile operation, safe-link validation and 320px layout.
