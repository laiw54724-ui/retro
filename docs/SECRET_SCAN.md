# Secret scanning record

The repository provides `pnpm security:audit`. It scans tracked and non-ignored untracked working-tree text files, existing web/API build artifacts, and text-like blobs reachable from all local Git refs for common credential formats. `pnpm security:audit -- --artifacts-only` is the post-build CI check. Findings report only detector, path/blob identifier, and line number; matched values are never printed. A Supabase JWT whose payload explicitly identifies the public `anon` role is allowed; service-role and undecodable JWTs are not.

This is a defense-in-depth check, not proof that no secret has ever existed. If it reports a possible credential:

1. treat the value as compromised;
2. revoke or rotate it in the provider first;
3. remove it from the current tree;
4. coordinate any shared-history rewrite with maintainers and downstream clones;
5. record remediation without copying the value.

## 2026-10-17 baseline

Result: PASS. The scanner checked 3,237 tracked/non-ignored worktree paths, 2,961 existing build artifact files, and 2,544 text-like objects reachable from local Git refs. It reported no potential credential patterns. A disposable artifact fixture also confirmed that a token-shaped value fails the gate while the value remains hidden. No credential value was printed or persisted by the scanner. The scan does not replace provider-side rotation, access review, or GitHub secret scanning.
