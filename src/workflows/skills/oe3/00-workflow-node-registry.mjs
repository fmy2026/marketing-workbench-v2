export const WORKFLOW_NODES = Object.freeze([
  Object.freeze({
    order: "01",
    number: 1,
    nodeKey: "launch_intake",
    nodeName: "Intake 规范",
    phase: "准备阶段",
    output: "launch_intake",
    subflows: Object.freeze(["路线归一", "游戏识别", "账户识别"])
  }),
  Object.freeze({
    order: "02",
    number: 2,
    nodeKey: "creation_context",
    nodeName: "创建上下文装配",
    phase: "准备阶段",
    output: "creation_context",
    subflows: Object.freeze(["账户状态", "触点引用", "monitor_id", "平台 app"]),
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
    subflows: Object.freeze(["游戏主档", "路线默认值", "保底物料包", "备用落地页"])
  }),
  Object.freeze({
    order: "04",
    number: 4,
    nodeKey: "account_resource_prepare",
    nodeName: "账户资源诊断与补齐",
    phase: "就绪阶段",
    output: "account_ready_report",
    subflows: Object.freeze(["头像", "DMP", "事件链", "视频可见性", "产品图", "备用落地页"])
  }),
  Object.freeze({
    order: "05",
    number: 5,
    nodeKey: "std_project_draft_builder",
    nodeName: "创建草稿生成",
    phase: "就绪阶段",
    output: "creation_draft",
    subflows: Object.freeze(["项目名", "草稿摘要", "稳定 Hash", "查重"])
  }),
  Object.freeze({
    order: "06",
    number: 6,
    nodeKey: "std_project_create_executor",
    nodeName: "创建执行",
    phase: "创建执行",
    output: "created_object",
    subflows: Object.freeze(["确认占位", "写入禁用", "边界锁定"])
  }),
  Object.freeze({
    order: "07",
    number: 7,
    nodeKey: "readback_closer",
    nodeName: "回查收口",
    phase: "创建执行",
    output: "readback_verified",
    subflows: Object.freeze(["回查占位", "字段一致性", "证据归档"])
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

  return {
    status: unregisteredSkillNodeKeys.length || nodesWithoutSkills.length || missingResourceSkills.length ? "failed" : "passed",
    nodeCount: WORKFLOW_NODES.length,
    nodeKeys: [...nodeKeys],
    unregisteredSkillNodeKeys,
    nodesWithoutSkills,
    requiredResourceTypeCount: requiredResourceTypes.length,
    node4SkillCount,
    node4ResourceSkillCountMatches: node4SkillCount === requiredResourceTypes.length,
    missingResourceSkills,
    monitorProvisionClassification: getWorkflowNode("creation_context")?.bootstrapCapabilities?.[0] || ""
  };
}
