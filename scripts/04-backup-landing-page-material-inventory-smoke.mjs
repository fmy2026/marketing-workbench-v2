import {
  assertNoSensitiveLeak,
  hashValue,
  runBackupLandingPageMaterialInventorySkill
} from "../src/workflows/skills/oe3/00-index.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const controlledUrls = [
  "https://controlled.example.invalid/jszc/default",
  "https://controlled.example.invalid/jszc/candidate-2",
  "https://controlled.example.invalid/jszc/candidate-3",
  "https://controlled.example.invalid/jszc/candidate-4"
];

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
  url_hash: hashValue(controlledUrls[index])
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
  const index = candidates.findIndex((item) => item.site_id === siteId);
  return {
    site_id: siteId,
    name: `site ${siteId}`,
    status,
    ...(index >= 0 ? { site_url: controlledUrls[index] } : {}),
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

async function runRecordedCase({ sourceSites, targetSites, targetSharedSites, failLabels }) {
  const resourceWrites = [];
  const repo = {
    async getBackupLandingPageCandidates() {
      return candidates;
    },
    async upsertEvidence() {},
    async upsertLandingPageAsset() {},
    async upsertAccountResourceReadonlyBySourceAsset(input) {
      resourceWrites.push(input);
    }
  };
  const result = await runBackupLandingPageMaterialInventorySkill({
    repo,
    bundle,
    readonlyClient: fakeClient({ sourceSites, targetSites, targetSharedSites, failLabels }),
    record: true,
    recordSkillRunResult: false,
    pageSize: 100
  });
  assertNoSensitiveLeak(result);
  return { result, resourceWrites };
}

const sourceFour = candidates.map((item) => site(item.site_id));
const success = await runCase("default_source_verified", {
  sourceSites: sourceFour,
  targetSites: []
});
assert(success.result.status === "needs_confirmation", "default source should need cross-account confirmation");
assert(success.result.outputSummary.conclusion === "target_shared_missing", "default source conclusion wrong");
assert(success.result.outputSummary.observation_status === "missing", "target shared miss observation status wrong");
assert(success.result.outputSummary.candidate_count === 4, "candidate count should be 4");
assert(success.result.blockers.includes("backup_landing_page_target_site_missing"), "target missing blocker absent");
assert(success.result.outputSummary.prepare_supported === false, "prepare_supported must stay false");
assert(success.result.outputSummary.cross_account_path.local_folder_required_for_this_inventory === false, "local folder should not block inventory");
assert(success.result.outputSummary.cross_account_path.allowed_transfer_mode === "manual_same_site_share_only", "manual share mode not recorded");

const targetOrdinaryExisting = await runCase("target_ordinary_inventory_cannot_replace_manual_share", {
  sourceSites: sourceFour,
  targetSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED")],
  targetSharedSites: []
});
assert(targetOrdinaryExisting.result.status === "needs_confirmation", "ordinary inventory must not replace manual share");
assert(targetOrdinaryExisting.result.outputSummary.conclusion === "target_shared_missing", "ordinary-only conclusion wrong");
assert(targetOrdinaryExisting.result.outputSummary.default_target_resolution_source === "", "ordinary inventory must remain diagnostic only");

const targetSharedExisting = await runCase("target_already_usable_from_shared_inventory", {
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "SHARE" })]
});
assert(targetSharedExisting.result.status === "passed", "target shared existing should pass");
assert(targetSharedExisting.result.outputSummary.conclusion === "target_already_usable", "target shared conclusion wrong");
assert(targetSharedExisting.result.outputSummary.default_target_resolution_source === "shared_inventory", "shared resolution source wrong");

const targetOrdinaryFailureWithSharedSuccess = await runCase("target_ordinary_inventory_is_diagnostic", {
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "SHARE" })],
  failLabels: ["target:page"]
});
assert(targetOrdinaryFailureWithSharedSuccess.result.status === "passed", "ordinary target inventory must not override shared authority");
assert(targetOrdinaryFailureWithSharedSuccess.result.outputSummary.observation_status === "verified", "shared success observation status wrong");

const targetSharedWrongType = await runCase("target_shared_inventory_requires_share_type", {
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "MY_CREATIONS" })]
});
assert(targetSharedWrongType.result.status === "needs_confirmation", "wrong share type must not pass");
assert(targetSharedWrongType.result.blockers.includes("backup_landing_page_target_share_type_invalid"), "wrong share type blocker absent");

const staleDbHashRows = [
  { ...candidates[0], url_hash: "sha256:stale-controlled-db-hash" },
  ...candidates.slice(1)
];
const staleDbHashButLiveSourceMatches = await runCase("stale_db_hash_but_live_source_matches_target", {
  candidateRows: staleDbHashRows,
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "SHARE" })]
});
assert(staleDbHashButLiveSourceMatches.result.status === "passed", "live source hash should override stale db hash");
assert(staleDbHashButLiveSourceMatches.result.outputSummary.default_target_hash_matches === true, "live source hash match should be true");

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

const unusableTarget = await runCase("target_unusable", {
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_REJECTED", { share_type: "SHARE" })]
});
assert(unusableTarget.result.status === "needs_confirmation", "unusable target should keep source verified but need confirmation");
assert(unusableTarget.result.blockers.includes("backup_landing_page_target_site_not_usable"), "unusable target blocker absent");

const targetHashMismatch = await runCase("target_hash_mismatch", {
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", {
    share_type: "SHARE",
    site_url: "https://controlled.example.invalid/jszc/changed"
  })]
});
assert(targetHashMismatch.result.status === "needs_confirmation", "hash mismatch should keep source verified but need confirmation");
assert(targetHashMismatch.result.blockers.includes("backup_landing_page_target_url_hash_mismatch"), "hash mismatch blocker absent");

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

const targetSharedFailure = await runCase("target_shared_readonly_degraded", {
  sourceSites: sourceFour,
  targetSites: [],
  failLabels: ["target_shared"]
});
assert(targetSharedFailure.result.status === "blocked", "target shared failure must block");
assert(targetSharedFailure.result.outputSummary.observation_status === "degraded", "target shared failure must be degraded");
assert(targetSharedFailure.result.blockers.includes("site_get_target_shared_blocked"), "target shared failure blocker absent");
assert(!targetSharedFailure.result.blockers.includes("backup_landing_page_target_site_missing"), "degraded target shared read must not imply missing site");

const degradedPersistence = await runRecordedCase({
  sourceSites: sourceFour,
  targetSites: [],
  failLabels: ["target_shared"]
});
assert(degradedPersistence.resourceWrites.length === 0, "degraded read must preserve the prior verified account resource");

const verifiedPersistence = await runRecordedCase({
  sourceSites: sourceFour,
  targetSites: [],
  targetSharedSites: [site(candidates[0].site_id, "AUDIT_ACCEPTED", { share_type: "SHARE" })]
});
assert(verifiedPersistence.resourceWrites.length === 1, "verified shared read must write one default resource");
assert(verifiedPersistence.resourceWrites[0].visibilityStatus === "visible", "verified shared read must set visible");
assert(verifiedPersistence.resourceWrites[0].readbackStatus === "readback_verified", "verified shared read must set readback verified");

const output = {
  status: "passed",
  cases: [
    success.name,
    targetOrdinaryExisting.name,
    targetSharedExisting.name,
    targetOrdinaryFailureWithSharedSuccess.name,
    targetSharedWrongType.name,
    staleDbHashButLiveSourceMatches.name,
    missingDefault.name,
    unusableDefault.name,
    unusableTarget.name,
    targetHashMismatch.name,
    ambiguousDefault.name,
    apiFailure.name,
    targetSharedFailure.name
  ],
  noRealPlatformWrite: true,
  noTokenRefresh: true
};
assertNoSensitiveLeak(output);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
