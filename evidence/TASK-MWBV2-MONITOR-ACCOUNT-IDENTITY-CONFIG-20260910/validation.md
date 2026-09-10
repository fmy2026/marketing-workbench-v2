# Monitor account identity effective-config validation

Validated at: 2026-09-10T09:54:39Z

## Automated regression

- `npm run test:monitor` passed. It verifies that two different account identity projections use their own `agent_id` values while the route candidate cannot override either one.
- `npm run test:workflow-case` and `npm run test:execution-plan` passed with zero platform writes.
- `npm run test:workbench-conversation`, `npm run test:workbench-progress`, and `npm run test:workbench-runtime-policy` passed. They cover stale confirmation removal, Chinese blocker presentation, exact confirmation, and zero-write execution stops.
- `npm run smoke:workflow-skills` passed; it confirms the registry remains three stages and seven Nodes and reported no real platform write.

## Authorized readonly check

The current test account was queried through the existing account-index and Monitor read APIs only. Its database account identity resolved to agent `617`; the Monitor query ran and `createCalled` was `false`. The result stopped at the expected readonly condition `monitor_exact_match_missing` because no exact existing Monitor was found. No Monitor creation endpoint was invoked.

## Data migration

`db/083_monitor_account_identity_effective_config.sql` applied successfully. The effective route contract has no `agent_id` in either Monitor defaults or reference candidates; the account-specific Monitor fields are `owner`, `media_account_id`, and `agent_id`.
