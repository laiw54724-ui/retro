# Security policy

Retro Desktop is an early-stage personal-site builder.

## Please report privately

Do not post working exploits, access tokens, private site data, or account details in a public GitHub issue.

For repository vulnerabilities, use GitHub's private vulnerability reporting / Security Advisory flow when available for this repository. If that channel is not enabled, contact the repository owner privately and include only the minimum reproduction details needed.

For copyright, privacy, or uploaded-content takedown requests, contact the repository owner privately through the repository profile. Include the affected public URL, the work or right involved, your relationship to it, and a safe contact method. Do not put private identity documents or unpublished content in a public issue.

## In scope

High-priority reports include:

- authentication bypass
- IDOR / cross-account site access
- draft/private data disclosure
- arbitrary script execution through user content
- unsafe file upload or content-type bypass
- ability to overwrite another user's draft or assets
- secret leakage
- guestbook abuse, moderation bypass, or unsafe public-content exposure

## Design assumptions

- User-authored content is structured JSON, not arbitrary HTML.
- Supported external URL schemes are HTTP, HTTPS, and mailto.
- Supported image uploads are JPEG, PNG, WebP, and GIF only.
- Server-side owner checks are required even though database RLS is also enabled.

## Repository secret checks

Run `pnpm security:audit` before merge. It scans tracked files and reachable local Git history while suppressing matched values. A passing heuristic scan is not a guarantee. If a credential is found, revoke or rotate it before coordinating removal or any history rewrite. See [`docs/SECRET_SCAN.md`](docs/SECRET_SCAN.md).
