# OAuth DNS Recovery Evidence

Recorded at: 2026-09-09T06:42:29Z

## Credential recovery

- DNS preflight for the OAuth host resolved IPv4 records successfully.
- A sandboxed process could not resolve DNS and failed before it received an HTTP response.
- The host-network execution then made the sole completed OAuth HTTP request: HTTP `200`, API code `0`, with a request ID present.
- The resulting protected credential status is `valid`; access-token expiry is `2026-09-10T06:42:03.802Z`, refresh-after is `2026-09-10T06:12:03.802Z`, and refresh-token expiry is `2026-10-09T06:42:03.802Z`.
- The final audit event is redacted and records only endpoint metadata, HTTP/API result, request-ID presence, and response hash.

## Case safety readback

- Case `CASE-MWBV2-FF06CC07F45EE8F4CC` remains on Job `JOB-MWBV2-20260909061610-9E1B4F` with `platform_action_count=0`.
- No workbench readonly recovery was started: the current workbench user is not the owner of the target advertiser and the account-isolation contract prohibits delegated operation.
- The pre-refresh `site_get_target_shared_blocked` remains until the target account owner performs the authorized readonly recovery.

## Next owner action

The target-account owner should open the current Job and enter `重新只读准备`. This is a readonly operation and must not use a confirmation phrase.

## Workbench readonly-recovery guidance

Recorded at: 2026-09-09T06:50:32Z

- For the generic `site_get_target_shared_blocked` root blocker on the latest Job, the workbench now presents a user-facing shared-site readonly-check message and the `重新只读准备` input hint; it does not show the `resolve_root_blocker:` action code.
- `npm run test:workbench-progress` passed, including the exact copy, input hint and no-internal-code assertions.
- `npm run test:workbench-conversation` passed. Its existing ordinary readonly-recovery test confirms the command retains the current Job and invokes only `dry_run`; its platform create count remains `0`.
