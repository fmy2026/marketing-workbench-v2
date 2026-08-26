import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";

const DOCUMENTS = {
  create: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/创建标准项目.md",
  list: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/获取标准项目列表.md",
  optimizedGoal: "/Users/hys/knowledge/01-个人本地知识库/01-官方文档/open.oceanengine.com-3.0-waibugei/巨量营销智擎版/调控任务/标准项目下获取可用优化目标.md"
};

const TASK_ID = "TASK-MWBV2-OE3-INSTANCE-ID-CREATE-EVIDENCE-RECONCILIATION";
const ARTIFACT_ID = "EV-OE3-INSTANCE-ID-CREATE-EVIDENCE-20260825";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalized(value) {
  return value.replace(/\\_/g, "_");
}

async function documentInfo(path) {
  const content = normalized(await readFile(path, "utf8"));
  return {
    path,
    sha256: `sha256:${hash(content)}`,
    content
  };
}

function requestParameterRow(content, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\|\\s*${escaped}(?:\\s+必填|\\s+条件必填)?\\s*\\|`, "i");
  return content.split("\n").find((line) => pattern.test(line)) || "";
}

function requestParameterSection(content) {
  const start = content.indexOf("# 请求参数");
  if (start < 0) return "";
  const rest = content.slice(start);
  const nextHeading = rest.search(/\n#\s+/);
  return nextHeading < 0 ? rest : rest.slice(0, nextHeading);
}

function resultFromDocuments(documents) {
  const createParameters = requestParameterSection(documents.create.content);
  const createInstanceLine = requestParameterRow(createParameters, "instance_id");
  const createMicroAppLine = requestParameterRow(createParameters, "micro_app_instance_id");
  const listInstanceLine = requestParameterRow(documents.list.content, "instance_id");
  const optimizedGoalLine = requestParameterRow(documents.optimizedGoal.content, "micro_app_instance_id");

  const fieldNameVerified = Boolean(createInstanceLine) && !createMicroAppLine;
  const typeVerified = fieldNameVerified && /\|\s*number\s*\|/i.test(createInstanceLine);
  const applicabilityVerified = fieldNameVerified &&
    /字节.*小游戏|小游戏.*字节/.test(createInstanceLine) &&
    /landing_type[\s\S]*MICRO_GAME/.test(createParameters) &&
    /delivery_medium[\s\S]*BYTE_GAME/.test(createParameters);
  const longIdTransportVerified = fieldNameVerified && /safe integer|json.*string|decimal.*string/i.test(createInstanceLine);
  const blockers = [
    ...(!fieldNameVerified || !typeVerified || !applicabilityVerified ? ["instance_id_create_contract_not_verified"] : []),
    ...(fieldNameVerified && typeVerified && applicabilityVerified && !longIdTransportVerified
      ? ["instance_id_long_id_transport_not_verified"]
      : [])
  ];

  return {
    task: TASK_ID,
    status: blockers.length ? "blocked" : "passed",
    documents: Object.values(documents).map(({ path, sha256 }) => ({ path, sha256, present: true })),
    createEvidence: {
      candidateField: "instance_id",
      fieldNameVerified,
      createFieldType: typeVerified ? "number" : "",
      fieldTypeVerified: typeVerified,
      landingType: "MICRO_GAME",
      deliveryMedium: "BYTE_GAME",
      applicabilityVerified,
      longIdTransportStrategy: longIdTransportVerified ? "documented" : "unverified",
      longIdTransportVerified
    },
    relatedEvidence: {
      listInstanceId: {
        present: Boolean(listInstanceLine),
        documentedType: /\bnumber\b/i.test(listInstanceLine) ? "number" : "",
        usableForCreate: false
      },
      optimizedGoalMicroAppInstanceId: {
        present: Boolean(optimizedGoalLine),
        documentedType: /\blong\b/i.test(documents.optimizedGoal.content) ? "Long" : "",
        usableForCreate: false
      }
    },
    blockers
  };
}

async function main() {
  const entries = await Promise.all(Object.entries(DOCUMENTS).map(async ([key, path]) => [key, await documentInfo(path)]));
  const result = resultFromDocuments(Object.fromEntries(entries));

  if (process.argv.includes("--record")) {
    const repo = new PostgresRepository();
    await repo.upsertEvidence({
      artifactId: ARTIFACT_ID,
      jobId: null,
      artifactType: "oe3_instance_id_create_evidence",
      title: "OE3 instance_id 创建字段本机官方证据",
      summary: `status=${result.status}; field_name_verified=${result.createEvidence.fieldNameVerified}; field_type_verified=${result.createEvidence.fieldTypeVerified}; applicability_verified=${result.createEvidence.applicabilityVerified}; long_id_transport_verified=${result.createEvidence.longIdTransportVerified}; blockers=${result.blockers.join(",") || "none"}`,
      contentHash: `sha256:${hash(JSON.stringify(result))}`,
      storageRef: `postgres:mwb.evidence_artifacts/${ARTIFACT_ID}`,
      sourceRef: "local_official_docs:std_project_create+std_project_list+optimized_goal_get",
      sourceUsage: "reference_only"
    });
  }

  // The expected absence of direct evidence is a valid check result, not a CLI failure.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`oe3_instance_id_create_evidence_check_failed:${error.message}\n`);
  process.exitCode = 1;
});
