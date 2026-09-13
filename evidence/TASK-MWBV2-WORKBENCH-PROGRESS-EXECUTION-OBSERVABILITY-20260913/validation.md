# Validation evidence

Validated 2026-09-13 CST against the migrated local schema and isolated test databases.

- AC-01: `npm run test:workbench-progress` and `npm run test:single-confirmation-orchestrator` passed. Resource action presentation is frozen in the Plan, and legacy snapshots explicitly render quantity as unrecorded.
- AC-02: `npm run test:node4-progress-projection`, `npm run test:workbench-progress`, and `npm run smoke:api` passed. The API supplies one `progress` projection consumed by the progress bar and workflow view.
- AC-03: `npm run test:execution-grant`, `npm run test:single-confirmation-orchestrator`, `npm run test:workbench-conversation`, `npm run test:workbench-auth-http`, and `npm run test:workbench-user-isolation` passed. The new isolated execution-cycle smoke also proves one confirmation activates the Plan once.
- AC-04: `node tests/run.mjs --file scripts/00-execution-cycle-observability-smoke.mjs` and `npm run test:verified-case-finalization` passed. The test verifies an `executing` Plan, two durable cycles, one finished cycle, one open cycle, and a Skill bound to its cycle.
- AC-05: `npm run check:runtime-consistency`, `npm run db:contract-check`, `npm run smoke:api`, `npm run check:project -- --phase start`, and the focused tests above passed. `npm run test:workflow-regression` was also run: six older standalone fixtures failed in readback scheduling and resource executors because their test-only scopes no longer model the current single-confirmation prerequisites. These files are outside the changed runtime path; their failures are recorded for fixture-maintenance follow-up and did not involve a real platform request.

Migration `db/091_workbench_progress_execution_observability.sql` was applied only after querying that `plan_status='executing'` count was zero. The local workbench LaunchAgent was restarted and `curl -I http://127.0.0.1:3000/` returned HTTP 200. The initial mode-switch reload failed and rolled back; the subsequent restart of the already-registered LaunchAgent succeeded.
