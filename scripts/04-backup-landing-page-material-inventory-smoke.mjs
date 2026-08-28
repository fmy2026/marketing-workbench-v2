import { assertNoSensitiveLeak, runBackupLandingPageMaterialInventorySkill } from "../src/workflows/skills/oe3/00-index.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const candidates = [
  ["LPA-JSZC-OE3-BACKUP-001", "7624750304608649243", "default"],
  ["LPA-JSZC-OE3-BACKUP-002", "7450371049210462218", "candidate"],
  ["LPA-JSZC-OE3-BACKUP-003", "7450398108389376051", "candidate"],
  ["LPA-JSZC-OE3-BACKUP-004", "7582805366296346662", "candidate"]
].map(([landing_page_asset_id, site_id, name], index) => ({
  landing_page_asset_id,
  route_id: "oceanengine_3_byte_mini_game",
  game_code: "JSZC",
  site_id,
  site_name: `JSZC ${name}`,
  source_advertiser_id: "1760246749825031",
  is_default: index === 0,
  status: index === 0 ? "active" : "reference_candidate",
  url_hash: `sha256:db-${index}`
}));

const bundle = {
  job: {
    job_id: "JOB-SMOKE-BACKUP-LANDING-INVENTORY",
    route_id: "oceanengine_3_byte_mini_game",
    game_code: "JSZC",
    advertiser_id: "1871922346964041",
    source_usage: "test_run"
  }
};

function site(siteId, status = "AUDIT_ACCEPTED", extra = {}) {
  return {
    site_id: siteId,
    name: `site ${siteId}`,
    status,
    ...extra
  };
}

function fakeRepo(candidateRows) {
  return {
    async getBackupLandingPageCandidates() {
      return candidateRows;
    },
    async upsertEvidence() {
      throw new Error("record_should_be_disabled");
    }
  };
}

function fakeClient({ sourceSites = [], targetSites = [], targetSharedSites = [], failLabels = [] } = {}) {
  return {
    async get({ label, query, endpoint, summarize }) {
      if (failLabels.some((item) => label.startsWith(item))) {
        return {
          label,
          endpoint,
          status: "blocked",
          httpStatus: 200,
          apiCode: "40000",
          requestIdPresent: true,
          responseHash: "sha256:blocked",
          summary: {}
        };
      }
      const isSource = query.advertiser_id === "1760246749825031";
      const isShared = query.share_type === "SHARE";
      const list = endpoint.includes("orange_site")
        ? targetSites
        : isSource
          ? sourceSites
          : isShared
            ? targetSharedSites
            : targetSites;
      const payload = {
        code: 0,
        request_id: "rid-smoke",
        data: {
          total_number: list.length,
          list
        }
      };
      return {
        label,
        endpoint,
        status: "passed",
        httpStatus: 200,
        apiCode: "0",
        requestIdPresent: true,
        responseHash: `sha256:${label.replace(/[^a-z0-9]/gi, "-")}`,
        summary: summarize(payload)
      };
    }
  };
}

async function runCase(name, { candidateRows = candidates, sourceSites, targetSites, targetSharedSites, failLabels }) {
  const result = await runBackupLandingPageMaterialInventorySkill({
    repo: fakeRepo(candidateRows),
    bundle,
    readonlyClient: fakeClient({ sourceSites, targetSites, targetSharedSites, failLabels }),
    record: false,
    pageSize: 100
  });
  assertNoSensitiveLeak(result);
  return { name, result };
}

const sourceFour = candidates.map((item) => site(item.site_id));
const success = await runCase("default_source_verified", {
  sourceSites: sourceFour,
  targetSites: []
});
assert(success.result.status === "needs_confirmation", "default source should need cross-account confirmation");
assert(success.result.outputSummary.conclusion === "default_source_verified", "default source conclusion wrong");
assert(success.result.outputSummary.candidate_count === 4, "candidate count should be 4");
assert(success.result.outputSummary.prepare_supported === false, "prepare_supported must stay false");
assert(success.result.outputSummary.cross_account_path.local_folder_required_for_this_inventory === false, "local folder should not block inventory");

const targetExisting = await runCase("target_already_usable", {
  sourceSites: sourceFour,
  targetSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "SHARE" })],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "SHARE" })]
});
assert(targetExisting.result.status === "passed", "target existing should pass");
assert(targetExisting.result.outputSummary.conclusion === "target_already_usable", "target existing conclusion wrong");

const missingDefault = await runCase("default_missing", {
  sourceSites: sourceFour.filter((item) => item.site_id !== candidates[0].site_id),
  targetSites: []
});
assert(missingDefault.result.status === "blocked", "missing default should block");
assert(missingDefault.result.blockers.includes("backup_landing_page_default_source_missing"), "missing default blocker absent");

const unusableDefault = await runCase("default_unusable", {
  sourceSites: [site(candidates[0].site_id, "AUDIT_REJECTED"), ...sourceFour.slice(1)],
  targetSites: []
});
assert(unusableDefault.result.status === "blocked", "unusable default should block");
assert(unusableDefault.result.blockers.includes("backup_landing_page_default_source_not_usable"), "unusable default blocker absent");

const ambiguousDefault = await runCase("default_ambiguous", {
  candidateRows: [...candidates, { ...candidates[0], site_id: "9999999999999999999" }],
  sourceSites: [...sourceFour, site("9999999999999999999")],
  targetSites: []
});
assert(ambiguousDefault.result.status === "blocked", "ambiguous default should block");
assert(ambiguousDefault.result.blockers.includes("backup_landing_page_default_candidate_not_unique"), "ambiguous default blocker absent");

const apiFailure = await runCase("api_failure", {
  sourceSites: sourceFour,
  targetSites: [],
  failLabels: ["source"]
});
assert(apiFailure.result.status === "blocked", "API failure should block");
assert(apiFailure.result.blockers.includes("site_get_source_blocked"), "source API blocker absent");

const output = {
  status: "passed",
  cases: [
    success.name,
    targetExisting.name,
    missingDefault.name,
    unusableDefault.name,
    ambiguousDefault.name,
    apiFailure.name
  ],
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
