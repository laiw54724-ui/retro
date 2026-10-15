# Security policy

Retro Desktop is an early-stage personal-site builder.

## Please report privately

Do not post working exploits, access tokens, private site data, or account details in a public GitHub issue.

For repository vulnerabilities, use GitHub's private vulnerability reporting / Security Advisory flow when available for this repository. If that channel is not enabled, contact the repository owner privately and include only the minimum reproduction details needed.

## In scope

High-priority reports include:

- authentication bypass
- IDOR / cross-account site access
- draft/private data disclosure
- arbitrary script execution through user content
- unsafe file upload or content-type bypass
- ability to overwrite another user's draft or assets
- secret leakage

## Design assumptions

- User-authored content is structured JSON, not arbitrary HTML.
- Supported external URL schemes are HTTP, HTTPS, and mailto.
- Supported image uploads are JPEG, PNG, WebP, and GIF only.
- Server-side owner checks are required even though database RLS is also enabled.
