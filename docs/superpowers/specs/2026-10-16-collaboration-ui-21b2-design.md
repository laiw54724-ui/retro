# 21B2 Collaboration UI Design

Date: 2026-10-16 (Asia/Singapore)
Issue: #21
Status: Approved direction; implementation pending

## Job and audience

Retro site owners need to invite trusted collaborators without leaving the editor or learning an administration system. Editors need the existing authoring experience with an unmistakable “cannot publish” boundary. Viewers need a safe way to inspect the current private draft without seeing controls that imply they can change it. Invite recipients may arrive signed out, on mobile, or with the wrong Google account.

The surface remains an operational Win98 editor. Collaboration is site-level administration, not an Instagram feature and not a new social identity system.

## Selected direction

Use one owner-only `協作者` button in the editor top bar. It opens a shared responsive Win98 dialog with two sections:

1. `成員` lists email and current role, supports editor/viewer changes, and removes a member behind an explicit confirmation.
2. `邀請` contains a compact email/role/expiry form and lists pending, used, expired, and revoked invites. A newly created raw token is shown only as a copyable invitation URL during that response state.

This is preferred over a right-panel tab because collaboration is unrelated to the selected desktop window, and preferred over a separate settings page because the first release has only one bounded site-level task.

## Roles and editor behavior

- `owner`: existing full editor, publish/retry, legacy migration, and collaborator management.
- `editor`: existing draft editor and private asset tools. Publish/retry, legacy migration, and collaboration management are absent; the top bar shows `編輯者` and explains that only the owner can publish.
- `viewer`: receives a dedicated read-only draft surface. It reuses the desktop/mobile visitor renderers with a private-draft banner and device toggle, but has no authoring controls, autosave, uploads, layout mode, publication, or collaboration management.

The server remains authoritative. Hiding controls is usability, not authorization; all mutations still rely on 21B1 request-time checks.

## Invitation flow and secret handling

The owner creates an invite with:

- a normalized Google email address;
- role `editor` or `viewer`;
- expiry of 1 hour, 24 hours, 3 days, or 7 days (default 24 hours).

The API returns the raw token once. The web app constructs `${origin}/invite#token=<token>`. The token is carried in the URL fragment so it is not sent in HTTP paths, Pages logs, request logs, or referrers.

On `/invite`:

1. The page validates the fragment shape, writes it to `sessionStorage`, and immediately clears the fragment with `history.replaceState`.
2. If signed out, it offers `使用 Google 登入並繼續` and returns to `/invite` after OAuth.
3. If signed in, the user explicitly accepts. The client sends `{ token }` to `POST /api/invites/accept`.
4. On success, session storage is cleared and the user opens the shared site.
5. On terminal failure (invalid, expired, revoked, used, or email mismatch), session storage is cleared. Email mismatch tells the user which currently signed-in email must be changed without revealing the invited email.

The token is never written to localStorage, analytics, console output, DOM attributes unrelated to the copy field, or any API URL.

## Components and data flow

### API client contract

Extend `SiteRecord` and list rows with `access_role`. Add typed collaboration operations for member/invite lists, create/revoke, role update/removal, and invite acceptance. The existing request helper remains the only bearer-token boundary.

### `CollaborationDialog`

An owner-only component loaded when opened. It owns server state and refreshes both lists after mutations. Mutations disable only the affected row/form, keep the dialog usable, and surface API error copy inside the dialog. It never silently optimistically changes a role or removes a row.

The one-time invite result uses a read-only URL field plus `複製邀請連結`; closing or refreshing discards the raw token. Existing invites can be revoked but their original link cannot be recovered.

### `InvitePage`

A standalone Win98 dialog on the teal desktop background. It has explicit loading, signed-out, ready, accepting, success, and terminal error states. It uses the existing auth subscription/session model and never attempts acceptance before the authenticated session is ready.

### Role-aware editor entry

`EditorPage` loads `access_role` before initializing editor behavior. Viewer branches to a read-only draft component before authoring effects are mounted. Editor uses the current editor but receives role-aware top-bar actions. Owner remains behaviorally unchanged apart from the new collaboration entry.

## Interaction and responsive layout

- Desktop dialog width is bounded around 680px and never taller than the viewport; member and invite lists scroll inside the body.
- At 320–767px the dialog fills the safe viewport with a sticky title bar and bottom actions. Forms stack to one column and controls remain at least 42px tall.
- Status is communicated by text plus color: `等待接受`, `已接受`, `已撤銷`, `已過期`.
- Role labels use `可編輯草稿` and `只能查看草稿` rather than relying on English role names.
- Focus enters the dialog heading/first control, Escape closes when no mutation is pending, and focus returns to the opener. Destructive confirmation is an accessible alert dialog.
- Copy success is announced through a polite live region; clipboard failure leaves the selectable URL visible.

## States and edge cases

- Empty members: show that only the owner currently has access.
- Empty invites: explain that invitation links are email-bound and single-use.
- Slow/error: keep the last successful list visible and show a retry action.
- Concurrent removal/role change: refresh and show `成員已變更，清單已重新載入` on 404/conflict.
- Current editor removed while open: the next autosave/read failure follows existing non-leaking handling and returns to the site list after a clear access-loss message.
- Viewer/editor attempts a bookmarked management action: UI has no entry, and API 403/404 remains authoritative.
- Owner cannot be demoted or removed because no owner row exists in the member list.
- Existing version conflict behavior remains unchanged; no real-time cursor, presence, chat, or automatic merge is added.

## Testing and release proof

- Unit: API client shapes, token fragment capture/clear, invitation state mapping, role-aware top-bar decisions, viewer branch, dialog mutation refresh, and copy fallback.
- E2E with mocked API/auth: owner creates/copies/revokes an invite and changes/removes a member; editor edits but cannot publish/manage; viewer can switch draft device views without edit controls; invite signed-out→OAuth-return→accept and terminal error states fit at 320px and desktop.
- Regression: existing 74 Playwright cases, all workspace unit/typecheck/build, Impeccable detector, and no raw token in application route URLs or logs.
- Deployment: deploy Pages and staging Worker only if runtime code changed, verify canonical/immutable Pages, health/auth boundaries, invite route rendering, and keep #21 open until the UI and live smoke are complete.

## Explicit non-goals

- No real-time cursors, presence, chat, comments, automatic merge, public visitor accounts, or ownership transfer.
- No reusable organization/team administration.
- No recovery of an invitation token after its one-time creation response.
- No change to OC fictional interaction semantics from 21A.
