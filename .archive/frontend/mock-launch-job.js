window.mockLaunchJob = {
  jobId: "MWBV2-LAUNCH-20260823-001",
  updatedAt: "2026-08-23 16:08:00 CST",
  agent: {
    name: "投放创建 Agent",
    status: "ready",
    statusText: "待开始",
    mode: "待执行",
    writePolicy: "只读预览"
  },
  intake: {
    userIntent: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993",
    routeId: "oceanengine_3_byte_mini_game",
    gameCode: "JSZC",
    advertiserId: "1871922175825993",
    missingFields: []
  },
  chat: [
    {
      role: "agent",
      text: "请提供推广路线、游戏标识和账户 ID。"
    },
    {
      role: "user",
      text: "推广路线 oceanengine_3_byte_mini_game，游戏 JSZC，账户 1871922175825993"
    },
    {
      role: "agent",
      text: "已识别路线、游戏和账户，可查看右侧 Workflow。"
    }
  ],
  phases: [
    {
      id: "prepare",
      title: "准备阶段",
      summary: "需求、上下文、保底包。",
      nodes: [
        {
          id: "intake",
          number: 1,
          name: "Intake 规范",
          status: "done",
          subflows: ["路线归一", "游戏识别", "账户识别"],
          detail: "三核心字段齐全。",
          output: "launch_intake"
        },
        {
          id: "creation-context",
          number: 2,
          name: "创建上下文装配",
          status: "done",
          subflows: ["账户状态", "触点引用", "平台版本"],
          detail: "账户与路线上下文可用。",
          output: "creation_context"
        },
        {
          id: "game-pack",
          number: 3,
          name: "游戏保底包解析",
          status: "done",
          subflows: ["游戏产品", "品牌类目", "投放目标", "预算排期", "DMP", "素材包"],
          detail: "保底包字段齐全。",
          output: "game_launch_pack"
        }
      ]
    },
    {
      id: "ready",
      title: "就绪阶段",
      summary: "资源诊断与草稿。",
      nodes: [
        {
          id: "resource-diagnose",
          number: 4,
          name: "账户资源诊断与补齐",
          status: "attention",
          subflows: ["头像", "DMP", "事件链", "视频可见性", "产品图可见性"],
          detail: "头像待确认。",
          output: "account_ready_report"
        },
        {
          id: "draft",
          number: 5,
          name: "创建草稿生成",
          status: "ready",
          subflows: ["项目名", "草稿摘要", "稳定 Hash", "查重"],
          detail: "草稿摘要已生成。",
          output: "creation_draft"
        }
      ]
    },
    {
      id: "execute",
      title: "创建执行",
      summary: "确认、执行、回查。",
      nodes: [
        {
          id: "create",
          number: 6,
          name: "创建执行",
          status: "locked",
          subflows: ["人工确认", "单次写入", "边界锁定"],
          detail: "等待确认。",
          output: "created_object"
        },
        {
          id: "readback",
          number: 7,
          name: "回查收口",
          status: "waiting",
          subflows: ["对象 ID", "字段一致性", "证据归档"],
          detail: "等待创建结果。",
          output: "readback_verified"
        }
      ]
    }
  ],
  diagnostics: {
    summary: "当前 3 项完成，1 项待确认，1 项可确认，2 项等待。",
    items: [
      {
        phase: "准备阶段",
        node: "Intake 规范",
        status: "passed",
        problem: "已通过",
        action: "继续"
      },
      {
        phase: "准备阶段",
        node: "创建上下文装配",
        status: "passed",
        problem: "已通过",
        action: "继续"
      },
      {
        phase: "准备阶段",
        node: "游戏保底包解析",
        status: "passed",
        problem: "已通过",
        action: "继续"
      },
      {
        phase: "就绪阶段",
        node: "账户资源诊断与补齐",
        status: "repairable",
        problem: "头像待确认",
        action: "确认资源"
      },
      {
        phase: "就绪阶段",
        node: "创建草稿生成",
        status: "needs_confirmation",
        problem: "待业务确认",
        action: "确认草稿"
      },
      {
        phase: "创建执行",
        node: "创建执行",
        status: "blocked",
        problem: "等待确认",
        action: "准备执行"
      },
      {
        phase: "创建执行",
        node: "回查收口",
        status: "waiting",
        problem: "等待创建结果",
        action: "回查收口"
      }
    ]
  },
  draft: {
    objectType: "std_project",
    projectName: "巨兽战场_字节小游戏_冷启动",
    routeId: "oceanengine_3_byte_mini_game",
    duplicateStatus: "待查重",
    payloadHash: "sha256:launch-draft-20260823",
    writePolicy: "只读预览",
    fields: [
      { label: "推广路线", value: "oceanengine_3_byte_mini_game" },
      { label: "创建对象", value: "std_project" },
      { label: "游戏标识", value: "JSZC" },
      { label: "账户 ID", value: "1871922175825993" },
      { label: "素材包", value: "保底物料包" },
      { label: "证据", value: "仅保存脱敏摘要和 hash" }
    ]
  }
};
