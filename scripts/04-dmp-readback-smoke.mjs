import {
  DMP_AVAILABLE_STATUS,
  dmpSelectRequest,
  probeDmpAudienceSet
} from "../src/platforms/oceanengineDmpReadonly.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const audienceId = "465498363";
const selectRequest = dmpSelectRequest({ advertiserId: "1871922346964041", selectType: 1, offset: 0 });
assert(JSON.stringify(selectRequest.requestFieldManifest.fieldNames) === JSON.stringify(["advertiser_id", "select_type", "offset", "limit"]), "dmp_select_field_contract_wrong");
assert(!("custom_audience_ids" in selectRequest.query), "dmp_select_must_not_filter_by_custom_audience_ids");
assert(!("page" in selectRequest.query || "page_size" in selectRequest.query), "dmp_select_must_not_use_page_fields");

const calls = [];
const client = {
  async get({ endpoint, query }) {
    calls.push({ endpoint, query });
    const isRead = endpoint === "dmp/custom_audience/read";
    const isAvailableSelect = endpoint === "dmp/custom_audience/select" && query.select_type === "1";
    const hasAudience = isRead || (isAvailableSelect && query.offset === "200") || (!isAvailableSelect && query.offset === "200");
    const audienceItems = hasAudience ? [{
      customAudienceId: audienceId,
      deliveryStatus: DMP_AVAILABLE_STATUS,
      status: "0",
      isDeleted: "0",
      pullOff: "0",
      pushStatus: "2"
    }] : [];
    return {
      status: "passed",
      httpStatus: 200,
      apiCode: "0",
      requestIdPresent: true,
      responseHash: `sha256:${endpoint.replaceAll("/", "-")}-${query.select_type || "read"}-${query.offset || "0"}`,
      summary: {
        audienceItems,
        customAudienceIds: audienceItems.map((item) => item.customAudienceId),
        customAudienceIdCount: audienceItems.length,
        totalNum: 400
      }
    };
  }
};

const result = await probeDmpAudienceSet({
  client,
  advertiserId: "1871922346964041",
  customAudienceIds: [audienceId],
  label: "dmp_readback_smoke"
});
assert(result.members[0]?.status === "passed", "dmp_available_member_should_pass");
const selectCalls = calls.filter((call) => call.endpoint === "dmp/custom_audience/select");
assert(selectCalls.length === 8, "dmp_select_should_scan_four_pages_for_both_select_types");
assert(selectCalls.every((call) => Object.keys(call.query).sort().join(",") === "advertiser_id,limit,offset,select_type"), "dmp_select_request_shape_drift");

process.stdout.write(`${JSON.stringify({
  status: "passed",
  selectFieldContract: selectRequest.requestFieldManifest.fieldNames,
  paginatedSelectCalls: selectCalls.length,
  memberStatus: result.members[0].status,
  rawResponseStored: false
}, null, 2)}\n`);
