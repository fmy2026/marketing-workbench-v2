import { safePlatformErrorSummary } from "../src/platforms/oceanengineStdProjectCreateExecutor.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rawMarker = "RAW-ERROR-TEXT-MUST-NOT-LEAK";
const filterEventInvalid = safePlatformErrorSummary({
  code: "40000",
  request_id: "safe-request-id",
  message: `filter_event invalid ${rawMarker}`,
  data: {
    detail: `filter_event invalid ${rawMarker}`
  }
});
assert(filterEventInvalid.offending_field_path === "audience.filter_event", "filter_event leaf should map to canonical audience.filter_event");
assert(filterEventInvalid.error_category === "invalid_field", "known filter_event validation should classify as invalid_field");
assert(filterEventInvalid.api_code === "40000", "safe API code should be retained");
assert(filterEventInvalid.request_id_present === true, "request id presence should be retained");
assert(!Object.hasOwn(filterEventInvalid, "request_id"), "complete request id must not be retained");
assert(!JSON.stringify(filterEventInvalid).includes(rawMarker), "raw error text must not be exposed by safe summary");
assert(!Object.hasOwn(filterEventInvalid, "message"), "raw message field must not be exposed");
assert(!Object.hasOwn(filterEventInvalid, "response"), "raw response field must not be exposed");

const canonicalFilterEventInvalid = safePlatformErrorSummary({
  code: "40000",
  error: "audience.filter_event required"
});
assert(canonicalFilterEventInvalid.offending_field_path === "audience.filter_event", "canonical filter_event path should remain supported");
assert(canonicalFilterEventInvalid.error_category === "invalid_field", "canonical filter_event error should classify as invalid_field");

const genericEventResource = safePlatformErrorSummary({
  code: "40000",
  message: "event resource not eligible"
});
assert(genericEventResource.offending_field_path === "", "generic event resource error must not invent a field path");
assert(genericEventResource.error_category === "resource_not_eligible", "generic event resource classification should be preserved");

const landingUrlInvalid = safePlatformErrorSummary({
  code: "400147",
  message: "landing link invalid"
});
assert(landingUrlInvalid.error_category === "landing_url_invalid", "landing URL classification should be preserved");

const permissionDenied = safePlatformErrorSummary({
  code: "40100",
  message: "permission denied"
});
assert(permissionDenied.error_category === "permission_denied", "permission classification should be preserved");

console.log(JSON.stringify({
  status: "passed",
  cases: [
    "filter_event_leaf_invalid_field",
    "filter_event_canonical_invalid_field",
    "generic_event_resource_preserved",
    "landing_url_preserved",
    "permission_preserved",
    "raw_error_not_exposed",
    "complete_request_id_not_retained"
  ],
  platformCalled: false,
  runtimeTruthWritten: false
}, null, 2));
