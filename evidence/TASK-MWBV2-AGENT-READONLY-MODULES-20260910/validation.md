# Task 4 validation

Verified 2026-09-10 CST. All database access below is local read-only test access; no model or platform write was performed.

## AC-01

`npm run test:agent-readonly-modules` passed. The public memory projection returned only the selected user's `runtime_truth` Case records, omitted full `advertiser_id`, returned masked account markers and only array-shaped controlled evidence references. The user-isolation smoke also passed.

## AC-02

`npm run test:agent-hub` and `npm run test:agent-readonly-modules` passed. The public registry contains exactly six modules, four read-only knowledge topics, seven Nodes, eight resource types and three Plan kinds. Its public JSON contains no internal file path.

## AC-03

`npm run test:agent-readonly-modules` passed. The statistics scope helper accepts `all` only for an administrator and safely defaults all other values to `self`; the existing user-isolation smoke confirms the operator summary has exactly one row.

## AC-04

`npm run test:workbench-conversation`, `npm run test:workbench-runtime-policy`, `npm run test:agent-model-config`, `npm run test:workbench-user-isolation`, syntax checks and `git diff --check` passed. Static checks on both local and LAN workbench entry points found the four module containers, no remaining old SOP label, and `401` for unauthenticated memory access. The local and LAN workbench services were restarted after the final code change.
