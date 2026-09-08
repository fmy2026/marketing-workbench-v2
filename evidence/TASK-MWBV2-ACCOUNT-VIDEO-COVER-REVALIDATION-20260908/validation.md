# Validation evidence

Validated at `2026-09-08T10:07:25Z`.

## AC-01

Postgres readback after migration and controlled approval showed the predecessor Case remains `active`, `maximum_create_attempts=3`, with three `oceanengine_std_project_create` actions, zero created standard-project objects, zero verified standard-project readbacks, `manual_review.approved=true`, and `manual_review.fix_version=video_cover_binding_v1`. Replacement count is zero before the owner starts the flow. The approval artifact is `EV-JOB-MWBV2-20260908051855-814308-MANUAL-REVIEW`; its command result states `rawPlatformResponseStored=false` and `platformWrites=0`.

## AC-02

`npm run test:workbench-address`, `npm run test:case-attempt-limit`, and `npm run test:workbench-conversation` passed. The address smoke proved two identical starts resolve to one replacement Case and one replacement creation claim; platform create calls were zero. The replacement Case contract was limited to one create attempt. Repository owner and approval guards remain the atomic source of eligibility.

## AC-03

`npm run test:guide-video-readonly` passed. It made nine read calls for the explicit-cover fixture: one gameplay lookup plus source/target video and source/target cover checks for two videos. Missing cover visibility blocked before Plan confirmation. Platform create calls were zero.

## AC-04

`npm run test:guide-video-payload` passed. Both required video items contained `video_id`, `image_mode`, `video_cover_id`, and the current-Job `guide_video_id`; the selected 96-path golden field shape hash is `sha256:647fab958e4eb4e0f6fe6773db2a4a968791c0bc07d3f075259c344a10004247`. Other account profiles retained their existing 92-path behavior. Platform create calls were zero.

## AC-05

`npm run test:std-project-readback` and `npm run test:case-corrective-create` passed. Node 07 requires both video bindings, both cover bindings, and both guide-video bindings to match. Cover or guide mismatch remains `guide_video_material_pending`, consumes no Plan, makes no second material read, and makes no create call. The corrective-create smoke preserved one create/readback call and prohibited creation after a verified object.

## AC-06

`npm run validate:schemas`, `npm run test:workflow-case`, `npm run test:workbench-runtime-policy`, `npm run test:project-contracts`, `npm run test:payload-contract`, and `git diff --check` passed. Focused module syntax checks also passed. All development and automated-test platform create/write counts were zero.

## AC-07

Backup created at `.local/backups/marketing_workbench_v2-20260908T095534Z.dump`. Migration `076_account_video_cover_revalidation.sql` applied in one transaction and updated exactly one target account. Postgres readback showed route `oceanengine_3_byte_mini_game`, game `JSZC`, `guide_video_required=true`, and `video_cover_required=true` for advertiser `1867508089433225`. LaunchAgent `com.hys.marketing-workbench.local-server` was restarted and `curl --noproxy '*' --max-time 5 http://192.168.42.7:3000/` returned HTTP 200. No real platform create was initiated; the owner action remains intentionally pending.

## Remaining business step

The development task is complete, but the business Case is not claimed verified. The account owner must enter the approved route, game, and account ID in the workbench, let the fresh readonly checks complete, inspect the existing confirmation card, and confirm once. Any fresh-read blocker or `40000` result is terminal for this one-attempt replacement and must not be retried.
