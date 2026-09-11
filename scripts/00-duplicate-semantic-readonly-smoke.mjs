import assert from "node:assert/strict";
import { runDuplicateReadonlyCheck } from "../src/workflows/skills/oe3/05-duplicate-readonly.mjs";

const FIELDS = [
  "asset_id",
  "landing_type",
  "native_type",
  "delivery_medium",
  "marketing_goal",
  "external_action",
  "deep_external_action",
  "deep_bid_type",
  "bid_type"
];

function bundle() {
  return {
    job: {
      job_id: "JOB-DUPLICATE-SEMANTIC-SMOKE",
      advertiser_id: "1871922175825993",
      source_usage: "test_run"
    },
    draft: {
      draft_id: "DRAFT-DUPLICATE-SEMANTIC-SMOKE",
      project_name: "semantic-smoke-new-name"
    },
    defaults: {
      objective: "AD_CONVERT_TYPE_PAY",
      deep_objective: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
      deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
      raw_defaults: {
        duplicate_semantic_contract: {
          version: "test-v1",
          status_first: "ALL_EXCEPT_DELETE",
          field_paths: FIELDS
        },
        payload_defaults: {
          project: {
            landing_type: "MICRO_GAME",
            native_type: "AWEME",
            marketing_goal: "VIDEO_AND_IMAGE"
          },
          strategy: {
            delivery_medium: "BYTE_GAME",
            bid_type: "CUSTOM"
          }
        }
      }
    },
    resources: [{ resource_type: "event_asset", platform_resource_id: "100000000001" }]
  };
}

function semanticItem(overrides = {}) {
  return {
    project_id: "700000000001",
    name: "different-name",
    asset_id: "100000000001",
    landing_type: "MICRO_GAME",
    native_type: "AWEME",
    delivery_medium: "BYTE_GAME",
    marketing_goal: "VIDEO_AND_IMAGE",
    external_action: "AD_CONVERT_TYPE_PAY",
    deep_external_action: "AD_CONVERT_TYPE_PURCHASE_ROI_7D",
    deep_bid_type: "PER_AND_SEVEN_PAY_ROI",
    bid_type: "CUSTOM",
    ...overrides
  };
}

function repoStub() {
  const state = { statuses: [], evidence: [] };
  return {
    state,
    async updateDraftDuplicateStatus(_draftId, status) { state.statuses.push(status); },
    async upsertEvidence(evidence) { state.evidence.push(evidence); }
  };
}

function clientStub({ nameItems = [], semanticPages = [[]], nameResponses = [], queryLog = [] } = {}) {
  let nameCall = 0;
  let semanticPage = 0;
  return {
    credentialState() { return { status: "ready", blockers: [] }; },
    async get({ query, summarize }) {
      queryLog.push(query);
      const filtering = JSON.parse(query.filtering);
      const response = filtering.name
        ? (nameResponses[nameCall++] || { items: nameItems })
        : { items: semanticPages[semanticPage++] || [] };
      const apiCode = Object.hasOwn(response, "apiCode") ? response.apiCode : "0";
      const payload = { code: apiCode, data: { list: response.items || [] } };
      const summary = summarize(payload);
      return {
        endpoint: "std_project/list",
        status: response.status || (apiCode === "0" ? "passed" : "blocked"),
        httpStatus: response.httpStatus ?? 200,
        apiCode,
        requestIdPresent: true,
        responseHash: "sha256:duplicate-semantic-smoke",
        summary,
        gap: response.gap || "平台只读 API 返回非通过状态."
      };
    }
  };
}

async function runCase(options) {
  const repo = repoStub();
  const queryLog = [];
  const waits = [];
  const result = await runDuplicateReadonlyCheck({
    repo,
    bundle: bundle(),
    client: clientStub({ ...options, queryLog }),
    allowReadonlyDependency: true,
    wait: async (delayMs) => { waits.push(delayMs); }
  });
  return { repo, result, queryLog, waits };
}

const nameDuplicate = await runCase({ nameItems: [semanticItem({ name: "semantic-smoke-new-name" })] });
assert.equal(nameDuplicate.result.status, "blocked");
assert.deepEqual(nameDuplicate.result.blockers, ["platform_duplicate_found"]);
assert.equal(nameDuplicate.result.outputSummary.matchMode, "name");

const semanticDuplicate = await runCase({ semanticPages: [[semanticItem()]] });
assert.equal(semanticDuplicate.result.status, "blocked");
assert.deepEqual(semanticDuplicate.result.blockers, ["platform_duplicate_found"]);
assert.equal(semanticDuplicate.result.outputSummary.matchMode, "semantic");
assert.equal(semanticDuplicate.result.outputSummary.matchedObjectId, "700000000001");

const deletedExcluded = await runCase({ semanticPages: [[]] });
assert.equal(deletedExcluded.result.status, "passed");
assert(deletedExcluded.queryLog.every((query) => JSON.parse(query.filtering).status_first === "ALL_EXCEPT_DELETE"));

const differentSemantic = await runCase({ semanticPages: [[semanticItem({ bid_type: "NO_BID" })]] });
assert.equal(differentSemantic.result.status, "passed");

const incomplete = await runCase({ semanticPages: [[semanticItem({ deep_bid_type: "" })]] });
assert.equal(incomplete.result.status, "blocked");
assert.deepEqual(incomplete.result.blockers, ["semantic_duplicate_readonly_incomplete"]);

const pageOne = Array.from({ length: 100 }, (_, index) => semanticItem({ project_id: `70000000${String(index).padStart(4, "0")}`, bid_type: "NO_BID" }));
const paginated = await runCase({ semanticPages: [pageOne, []] });
assert.equal(paginated.result.status, "passed");
assert.equal(paginated.queryLog.length, 3);
assert.equal(paginated.result.outputSummary.semanticCandidateCount, 100);
assert(paginated.repo.state.evidence.every((entry) => entry.summary.includes("response_body_stored=false")));

const rateLimitRecovered = await runCase({
  nameResponses: [{ apiCode: "40100" }, { items: [] }],
  semanticPages: [[]]
});
assert.equal(rateLimitRecovered.result.status, "passed");
assert.equal(rateLimitRecovered.queryLog.length, 3);
assert.deepEqual(rateLimitRecovered.queryLog[0], rateLimitRecovered.queryLog[1]);
assert.equal(rateLimitRecovered.waits.length, 1);
assert(rateLimitRecovered.waits[0] >= 20_000 && rateLimitRecovered.waits[0] <= 24_000);
assert.equal(rateLimitRecovered.result.outputSummary.recoveredAfterRateLimit, true);
assert.equal(rateLimitRecovered.result.outputSummary.probeAttemptCount, 3);
assert.equal(rateLimitRecovered.result.outputSummary.rateLimitedCount, 1);
assert(rateLimitRecovered.repo.state.evidence[0].summary.includes("recovered_after_rate_limit=true"));

const rateLimitExhausted = await runCase({
  nameResponses: [{ apiCode: "40100" }, { apiCode: "40100" }]
});
assert.equal(rateLimitExhausted.result.status, "blocked");
assert.deepEqual(rateLimitExhausted.result.blockers, ["duplicate_readonly_rate_limited"]);
assert.equal(rateLimitExhausted.result.outputSummary.apiCode, "40100");
assert.equal(rateLimitExhausted.result.outputSummary.finalApiCode, "40100");
assert.equal(rateLimitExhausted.queryLog.length, 2);
assert.equal(rateLimitExhausted.waits.length, 1);

const nonRateLimit = await runCase({ nameResponses: [{ apiCode: "40000" }] });
assert.equal(nonRateLimit.result.status, "blocked");
assert.deepEqual(nonRateLimit.result.blockers, ["duplicate_readonly_probe_not_passed"]);
assert.equal(nonRateLimit.queryLog.length, 1);
assert.equal(nonRateLimit.waits.length, 0);

for (const response of [
  { apiCode: "40100", httpStatus: 429 },
  { apiCode: "", httpStatus: 504, status: "error" },
  { apiCode: "", httpStatus: null, status: "error" },
  { apiCode: "", httpStatus: 200, status: "error" }
]) {
  const nonRetryableFailure = await runCase({ nameResponses: [response] });
  assert.equal(nonRetryableFailure.result.status, "blocked");
  assert.deepEqual(nonRetryableFailure.result.blockers, ["duplicate_readonly_probe_not_passed"]);
  assert.equal(nonRetryableFailure.queryLog.length, 1);
  assert.equal(nonRetryableFailure.waits.length, 0);
}

console.log(JSON.stringify({
  status: "passed",
  nameDuplicateBlocked: true,
  semanticDuplicateBlocked: true,
  deletedExcluded: true,
  incompleteCandidateFailClosed: true,
  paginatedReadonly: true,
  rateLimitRecovered: true,
  rateLimitExhaustedFailClosed: true,
  nonRateLimitNotRetried: true,
  timeoutNetworkParseFailuresNotRetried: true,
  platformWrites: 0
}));
