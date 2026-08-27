import { OE3_REQUIRED_RESOURCE_TYPES, OE3_RESOURCE_LABELS } from "./00-contracts.mjs";

function child(id, label, statusSource) {
  return Object.freeze({ id, label, statusSource: Object.freeze(statusSource) });
}

const node4ResourceChildren = Object.freeze(OE3_REQUIRED_RESOURCE_TYPES.map((resourceType) => child(
  `resource-${resourceType}`,
  OE3_RESOURCE_LABELS[resourceType],
  { kind: "latest_skill", skillKeys: [`resource-verify-${resourceType.replace(/_/g, "-")}`] }
)));

const node4Children = Object.freeze([
  child("baseline-resource-bootstrap", "保底候选装配", { kind: "latest_skill", skillKeys: ["resource-bootstrap-from-blueprints"] }),
  child("target-resource-readonly", "目标账户只读核验", { kind: "latest_skill", skillKeys: ["resource-live-readonly-reconcile"] }),
  ...node4ResourceChildren
]);

export const WORKFLOW_NODES = Object.freeze([
  Object.freeze({
    order: "01",
    number: 1,
    nodeKey: "launch_intake",
    nodeName: "Intake 规范",
    phase: "准备阶段",
    output: "launch_intake",
    subflows: Object.freeze(["路线归一", "游戏识别", "账户识别"]),
    children: Object.freeze([
      child("route-normalize", "路线归一", { kind: "node_status" }),
      child("game-identify", "游戏识别", { kind: "node_status" }),
      child("advertiser-identify", "账户识别", { kind: "node_status" })
    ])
  }),
  Object.freeze({
    order: "02",
    number: 2,
    nodeKey: "creation_context",
    nodeName: "创建上下文装配",
    phase: "准备阶段",
    output: "creation_context",
    subflows: Object.freeze(["账户状态", "触点引用", "monitor", "平台 App"]),
    children: Object.freeze([
      child("account-status", "账户状态", { kind: "latest_skill", skillKeys: ["context-resolve-account"] }),
      child("touchpoint-reference", "触点引用", { kind: "latest_skill", skillKeys: ["context-resolve-touchpoint"] }),
      child("monitor", "monitor", { kind: "latest_skill", skillKeys: ["monitor-readback", "monitor-ensure", "monitor-plan", "monitor-query"] }),
      child("platform-app", "平台 App", { kind: "latest_skill", skillKeys: ["context-resolve-platform-app"] })
    ]),
    bootstrapCapabilities: Object.freeze([
      "monitor-provision is a creation-context bootstrap capability; it is not part of automatic ad job real-create execution."
    ])
  }),
  Object.freeze({
    order: "03",
    number: 3,
    nodeKey: "game_launch_pack",
    nodeName: "游戏保底包解析",
    phase: "准备阶段",
    output: "game_launch_pack",
    subflows: Object.freeze(["游戏主档", "路线默认值", "保底物料包", "备用落地页", "资源蓝图"]),
    children: Object.freeze([
      child("game-master", "游戏主档", { kind: "latest_skill", skillKeys: ["launch-pack-resolve-game"] }),
      child("route-defaults", "路线默认值", { kind: "latest_skill", skillKeys: ["launch-pack-resolve-defaults"] }),
      child("base-material-pack", "保底物料包", { kind: "latest_skill", skillKeys: ["launch-pack-resolve-materials"] }),
      child("backup-landing-page", "备用落地页", { kind: "latest_skill", skillKeys: ["launch-pack-resolve-backup-landing-page"] }),
      child("baseline-resource-blueprints", "资源蓝图", { kind: "latest_skill", skillKeys: ["launch-pack-resolve-resource-blueprints"] })
    ])
  }),
  Object.freeze({
    order: "04",
    number: 4,
    nodeKey: "account_resource_prepare",
    nodeName: "账户资源准备",
    phase: "就绪阶段",
    output: "account_ready_report",
    subflows: Object.freeze(node4Children.map((item) => item.label)),
    children: node4Children
  }),
  Object.freeze({
    order: "05",
    number: 5,
    nodeKey: "std_project_draft_builder",
    nodeName: "创建草稿生成",
    phase: "就绪阶段",
    output: "creation_draft",
    subflows: Object.freeze(["项目名与草稿", "字段合同", "查重", "创建就绪"]),
    children: Object.freeze([
      child("project-name-and-draft", "项目名与草稿", { kind: "latest_skill", skillKeys: ["payload-build"] }),
      child("field-contract", "字段合同", { kind: "latest_skill", skillKeys: ["payload-contract"] }),
      child("duplicate-check", "查重", { kind: "latest_skill", skillKeys: ["duplicate-check"] }),
      child("create-readiness", "创建就绪", { kind: "latest_skill", skillKeys: ["create-readiness"] })
    ])
  }),
  Object.freeze({
    order: "06",
    number: 6,
    nodeKey: "std_project_create_executor",
    nodeName: "创建执行",
    phase: "创建执行",
    output: "created_object",
    subflows: Object.freeze(["创建授权", "单次创建", "创建结果"]),
    children: Object.freeze([
      child("creation-grant", "创建授权", { kind: "execution_grant" }),
      child("create-once", "单次创建", { kind: "latest_skill", skillKeys: ["create-once"] }),
      child("create-result", "创建结果", { kind: "created_object" })
    ])
  }),
  Object.freeze({
    order: "07",
    number: 7,
    nodeKey: "readback_closer",
    nodeName: "回查收口",
    phase: "创建执行",
    output: "readback_verified",
    subflows: Object.freeze(["对象回查", "字段一致性", "证据归档"]),
    children: Object.freeze([
      child("object-readback", "对象回查", { kind: "latest_skill", skillKeys: ["readback-std-project"] }),
      child("field-consistency", "字段一致性", { kind: "readback_consistency" }),
      child("evidence-archive", "证据归档", { kind: "readback_evidence" })
    ])
  })
]);

export function getWorkflowNode(nodeKey) {
  return WORKFLOW_NODES.find((node) => node.nodeKey === nodeKey) || null;
}

export function getWorkflowNodeByNumber(number) {
  const target = Number(number);
  return WORKFLOW_NODES.find((node) => node.number === target) || null;
}

export function validateWorkflowNodeRegistry({
  skillDefinitions = [],
  requiredResourceTypes = []
} = {}) {
  const nodeKeys = new Set(WORKFLOW_NODES.map((node) => node.nodeKey));
  const skillNodeKeys = new Set(skillDefinitions.map((skill) => skill.nodeKey));
  const unregisteredSkillNodeKeys = [...skillNodeKeys].filter((nodeKey) => !nodeKeys.has(nodeKey));
  const nodesWithoutSkills = [...nodeKeys].filter((nodeKey) => !skillDefinitions.some((skill) => skill.nodeKey === nodeKey));
  const resourceSkillKeys = requiredResourceTypes.map((resourceType) => `resource-verify-${resourceType.replace(/_/g, "-")}`);
  const missingResourceSkills = resourceSkillKeys.filter((skillKey) => !skillDefinitions.some((skill) => skill.skillKey === skillKey));
  const node4SkillCount = skillDefinitions.filter((skill) => skill.nodeKey === "account_resource_prepare").length;
  const node4ResourceSkillCount = skillDefinitions.filter((skill) => skill.skillKey.startsWith("resource-verify-")).length;
  const children = WORKFLOW_NODES.flatMap((node) => node.children || []);
  const childIds = children.map((item) => item.id);
  const childIdsUnique = new Set(childIds).size === childIds.length;
  const node4ChildResourceTypes = (getWorkflowNode("account_resource_prepare")?.children || [])
    .filter((item) => item.id.startsWith("resource-"))
    .map((item) => item.id.replace(/^resource-/, ""));
  const node4ChildrenMatchResources = requiredResourceTypes.length === node4ChildResourceTypes.length &&
    requiredResourceTypes.every((resourceType) => node4ChildResourceTypes.includes(resourceType));

  return {
    status: unregisteredSkillNodeKeys.length || nodesWithoutSkills.length || missingResourceSkills.length || !childIdsUnique || !node4ChildrenMatchResources ? "failed" : "passed",
    nodeCount: WORKFLOW_NODES.length,
    nodeKeys: [...nodeKeys],
    unregisteredSkillNodeKeys,
    nodesWithoutSkills,
    requiredResourceTypeCount: requiredResourceTypes.length,
    node4SkillCount,
    node4ResourceSkillCountMatches: node4ResourceSkillCount === requiredResourceTypes.length,
    node4ChildResourceTypes,
    node4ChildrenMatchResources,
    childCount: children.length,
    childIdsUnique,
    missingResourceSkills,
    monitorProvisionClassification: getWorkflowNode("creation_context")?.bootstrapCapabilities?.[0] || ""
  };
}
