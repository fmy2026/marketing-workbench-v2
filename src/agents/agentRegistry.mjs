import { OE3_REQUIRED_RESOURCE_TYPES } from "../workflows/skills/oe3/00-contracts.mjs";
import { WORKFLOW_NODES } from "../workflows/skills/oe3/00-workflow-node-registry.mjs";

const LAUNCH_CREATION_MODULES = Object.freeze([
  Object.freeze({ key: "overview", label: "Agent 概览" }),
  Object.freeze({ key: "conversation", label: "对话状态" }),
  Object.freeze({ key: "memory", label: "记忆" }),
  Object.freeze({ key: "knowledge", label: "知识库" }),
  Object.freeze({ key: "skills", label: "技能" }),
  Object.freeze({ key: "statistics", label: "数据统计" })
]);

const PLAN_KINDS = Object.freeze([
  Object.freeze({ key: "monitor_bootstrap", label: "监测准备" }),
  Object.freeze({ key: "resource_prepare", label: "资源准备" }),
  Object.freeze({ key: "std_project_create", label: "单次创建" })
]);

const LAUNCH_CREATION_KNOWLEDGE_TOPICS = Object.freeze([
  Object.freeze({ title: "输入规范", description: "只接收推广路线、游戏标识和账户 ID；缺失项必须补齐并完成账户归属校验。" }),
  Object.freeze({ title: "资源规则", description: "资源准备以当前路线、游戏和账户能力为准；未支持自动准备的缺失资源只形成 blocker。" }),
  Object.freeze({ title: "Plan 与确认", description: "草稿、Plan、确认和执行均受固定 Workflow 约束；每份确认 Plan 只能按冻结动作消费一次。" }),
  Object.freeze({ title: "安全边界", description: "模型只识别意图和槽位；Gate、下一步、权限与平台动作由确定性机制和权威回查决定。" })
]);

const LAUNCH_CREATION_CONVERSATION_PRESETS = Object.freeze({
  intake: Object.freeze([
    Object.freeze({ key: "route_oe3", label: "OE3 字节小游戏", message: "路线：oceanengine_3_byte_mini_game" }),
    Object.freeze({ key: "game_jszc", label: "巨兽战场（JSZC）", message: "游戏：JSZC" })
  ]),
  active: Object.freeze([
    Object.freeze({ key: "status", label: "查看当前进度", message: "查看状态" }),
    Object.freeze({ key: "blocker", label: "为什么卡住", message: "为什么卡住" }),
    Object.freeze({ key: "next", label: "下一步是什么", message: "下一步是什么" })
  ])
});

const AGENTS = Object.freeze([
  Object.freeze({
    agentKey: "launch_creation",
    displayName: "投放创建",
    description: "将自然语言或规范化需求转换为可验证的投放创建任务，并按固定 Workflow 推进。",
    status: "available",
    modelConfigurable: true,
    modules: LAUNCH_CREATION_MODULES,
    conversationPresets: LAUNCH_CREATION_CONVERSATION_PRESETS,
    knowledgeTopics: LAUNCH_CREATION_KNOWLEDGE_TOPICS,
    capabilitySummary: Object.freeze({
      workflowNodeCount: WORKFLOW_NODES.length,
      resourceTypeCount: OE3_REQUIRED_RESOURCE_TYPES.length,
      planKindCount: PLAN_KINDS.length
    })
  })
]);

function publicNode(node) {
  return Object.freeze({
    number: node.number,
    nodeKey: node.nodeKey,
    name: node.nodeName,
    phase: node.phase,
    skillGroup: Object.freeze((node.children || []).map((child) => child.label)),
    inputs: Object.freeze([...node.subflows]),
    outputs: Object.freeze([node.output]),
    statusMeaning: "通过表示该节点的受控输出已满足；等待表示仍需补齐输入、只读准备或确认；阻断时以当前 Case 的唯一 blocker 为准。"
  });
}

function publicAgent(agent) {
  return {
    agentKey: agent.agentKey,
    displayName: agent.displayName,
    description: agent.description,
    status: agent.status,
    modelConfigurable: agent.modelConfigurable,
    modules: agent.modules.map(({ key, label }) => ({ key, label })),
    conversationPresets: Object.fromEntries(Object.entries(agent.conversationPresets || {}).map(([group, presets]) => [
      group,
      presets.map((preset) => ({ ...preset }))
    ])),
    capabilitySummary: { ...agent.capabilitySummary }
  };
}

export function listPublicAgents() {
  return AGENTS
    .filter((agent) => agent.status === "available")
    .map(publicAgent);
}

export function getPublicAgent(agentKey) {
  const agent = AGENTS.find((candidate) => candidate.agentKey === String(agentKey || "").trim());
  if (!agent || agent.status !== "available") return null;
  return {
    ...publicAgent(agent),
    positioning: "任务型投放创建 Agent；模型只可参与意图与槽位识别，Workflow、Gate、Plan 与执行权限保持确定性。",
    supportedScope: "当前仅支持 OE3 字节小游戏单账户标准项目创建流程。",
    knowledgeTopics: agent.knowledgeTopics.map((topic) => ({ ...topic })),
    plans: PLAN_KINDS.map(({ key, label }) => ({ key, label })),
    workflowNodes: WORKFLOW_NODES.map(publicNode)
  };
}

export function isRegisteredAgentPath(pathname = "") {
  const normalized = String(pathname || "").replace(/\/+$/, "") || "/";
  return normalized === "/agents" || AGENTS.some((agent) => normalized === `/agents/${agent.agentKey.replace(/_/g, "-")}`);
}

export const LAUNCH_CREATION_MODULE_KEYS = Object.freeze(LAUNCH_CREATION_MODULES.map((module) => module.key));
