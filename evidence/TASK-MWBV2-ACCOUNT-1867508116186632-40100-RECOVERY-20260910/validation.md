# TASK-MWBV2-ACCOUNT-1867508116186632-40100-RECOVERY-20260910 validation

All timestamps below are UTC. Evidence stores only IDs, hashes, statuses and safe summaries; no credentials, raw payloads, raw responses or full URLs were captured.

## AC-01 — task startup

- Verified at: `2026-09-10T03:30:12Z`
- Method: `npm run check:project -- --phase start`
- Result: passed for active Task `TASK-MWBV2-ACCOUNT-1867508116186632-40100-RECOVERY-20260910`; only the Task, Manifest and `project.state.json` changed at startup.

## AC-02 — runtime 40100 contract

- Verified at: `2026-09-10T03:33:29Z`
- Service: `com.hys.marketing-workbench.local-server` restarted to PID `67298`, started `2026-09-10 11:31:10 +08` from the current project working directory.
- Browser evidence: the authenticated workbench page reloaded successfully after restart.
- Database evidence: `mwb.platform_action_deliveries` exists and `platform_actions_error_category_check` contains `system_rate_limited`.

## AC-03 — approved manual review

- Verified at: `2026-09-10T03:32:05Z`
- Controlled command completed with `status=approved`, evidence artifact `EV-JOB-MWBV2-20260909081433-087541-MANUAL-REVIEW`, `diagnosis_category=system_rate_limited`, `fix_version=std_project_40100_redelivery_94e22eea` and `rawPlatformResponseStored=false`.
- The predecessor Case still had exactly three `oceanengine_std_project_create` actions, zero `std_project` objects and zero verified `std_project` readbacks before replacement.
- Platform writes by the review operation: `0`.

## AC-04 — replacement Case fresh readonly

- Verified at: `2026-09-10T03:33:29Z`
- The owner-bound workbench command `重新只读准备` atomically changed predecessor `CASE-MWBV2-FF06CC07F45EE8F4CC` to `cancelled` and created one active replacement `CASE-MWBV2-0F11DE6EF5CEB4097B` with Job `JOB-MWBV2-20260910033223-093F5A`.
- Replacement fact: `maximum_create_attempts=1`, `attempts_used=0`, `platform_action_count=0`.
- Fresh readonly completed through Node 05 but produced root blocker `guide_video_current_job_readonly_missing`; Node 06 remained locked and Node 07 waiting. No platform project creation was attempted.

## AC-05 — Create confirmation contract

- Verified at: `2026-09-10T03:33:29Z`
- Not run: the replacement summary is `resolve_case_blocker`, not `await_job_write_authorization`; no new confirmation card or external platform create action exists.
- Stop enforced: no confirmation, action grant, Plan consumption, delivery or retry was initiated for the replacement Case.
