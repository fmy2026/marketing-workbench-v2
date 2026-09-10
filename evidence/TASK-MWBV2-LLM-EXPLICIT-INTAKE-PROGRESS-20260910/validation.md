# Validation evidence — 2026-09-10

All tests below use mock adapters and fixtures. No credential was entered, no new account was created, and no platform write was invoked.

| Acceptance | Command | Result |
| --- | --- | --- |
| AC-01 | `npm run test:llm-explicit-intake-progress` | Passed: full rule Intake bypassed the mock model; partial slots invoked it; missing route without in-message evidence was rejected; explicit “抖小” normalized only when present; prompt injection and exact confirmation failed closed. Output reported `rules`, `rules_fallback`, `llm_assisted`, and `realPlatformWrites: 0`. |
| AC-02 | `npm run test:workbench-conversation` | Passed: confirmation remained exact and plan-bound; readback stayed readonly; model-derived invalid intent failed closed. |
| AC-03 | `npm run test:workbench-runtime-policy` | Passed: latest Job, exact Plan hash, workbench source and a single confirmation winner remain required; `realPlatformWriteCalled: false`. |
| AC-04 | `npm run test:agent-model-config`, `npm run test:agent-hub`, `npm run test:workbench-progress`, `npm run test:agent-readonly-modules` | Passed. Model configuration remained per-user/Agent with 0600 atomic credentials and no real network call; public shell reports six modules and seven Nodes; readonly-module smoke confirmed no platform write. The final readonly-module run used local Postgres only because the standard sandbox denied its local socket. |
| AC-05 | `git diff --check`, `npm run check:project -- --phase start` | Passed at `2026-09-10T09:12:32Z`: active Task structure, changed-file routes and control/workflow domains validated; no database or platform access by the checker. Closing checks follow this evidence record. |
