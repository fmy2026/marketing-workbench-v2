# TASK-MWBV2-GUIDE-VIDEO-CURRENT-JOB-CACHE-BINDING-20260910 validation

All timestamps are UTC. Evidence contains only IDs, statuses, counts, hashes and safe summaries; no credentials, raw payloads, raw responses or full URLs are stored.

## AC-01 — task startup

- Verified at: `2026-09-10T03:42:16Z`
- `npm run check:project -- --phase start` passed for the new control/workflow Task.
- The prior recovery Task was first closed as `cancelled` after its declared fresh-readonly stop condition; its Task closure files are recorded as this Task's baseline dirty files.

## AC-02 — generic cache regression

- Verified at: `2026-09-10T03:44:31Z`
- `npm run test:guide-video-readonly` passed. Previous-Job passed and blocked metadata, and a current-Job wrong-instance binding, each made exactly one fresh gameplay readonly call. Current-Job passed, not_required and blocked metadata made zero repeat gameplay calls.
- `npm run test:guide-video-payload`, `npm run smoke:workflow-skills`, `npm run check:runtime-consistency` and `npm run db:contract-check` all passed. Their summaries report zero real platform writes.

## AC-03 — service load

- Verified at: `2026-09-10T03:44:51Z`
- Commit `0177fe0` was present before restart. `com.hys.marketing-workbench.local-server` restarted to PID `76419` at `2026-09-10 11:44:51 +08`.
- The configured listener reported `http://192.168.42.7:3000/`; the existing authenticated Chrome workbench page loaded from that origin. Restart invalidated the browser session afterwards, as expected for the restarted local server.

## AC-04 — current-Job readonly recovery

- Verified at: `2026-09-10T03:46:21Z`
- The authenticated owner submitted `重新只读准备` for `CASE-MWBV2-0F11DE6EF5CEB4097B` and `JOB-MWBV2-20260910033223-093F5A` before restart-session invalidation.
- The runtime created `EV-JOB-MWBV2-20260910033223-093F5A-GUIDE-VIDEO-READONLY` with `required=true`, `status=passed`, one approved gameplay result, one distinct guide-video result, request ID and response hash present, and no response body stored.
- `resource-verify-video-asset` recorded `source=fresh_gameplay_readonly`; the unique verified instance metadata now binds to the current Job and instance. `guide_video_current_job_readonly_missing` is absent from the Case summary.

## AC-05 — ready Plan and zero-write boundary

- Verified at: `2026-09-10T03:47:37Z`
- The Case Gate is `await_job_write_authorization`; its next action is `obtain_single_plan_confirmation`. The ready Plan has one `std_project_create` action and zero blockers.
- The Case remains `attempts_used=0`, `maximum_attempts=1`, `platform_action_count=0`; the Job has zero confirmations, platform actions, created objects and verified readbacks.
- The Plan is V1 because the existing runner explicitly reuses a blocked/planned/ready plan for the same unconfirmed logical Attempt. This is a readiness snapshot, not a consumed or confirmed frozen Plan; no prior confirmation or action was modified.

## Task closure

- Verified at: `2026-09-10T03:49:30Z`
- `npm run check:project -- --phase before-close` passed with all five acceptance checks passed.
- The Task is completed with no open gap. The ready confirmation card is an owner-controlled runtime step, not an unfinished development requirement.
