import {
  LAUNCH_REQUEST_OPERATION,
  PROJECT_VIDEO_APPEND_OPERATION
} from "../agents/launchRequest.mjs";

// Operation contracts select presentation and bounded workflow behaviour only.
// They never select a platform endpoint or relax the Plan/confirmation boundary.
export const LAUNCH_OPERATION_CONTRACTS = Object.freeze({
  [LAUNCH_REQUEST_OPERATION]: Object.freeze({
    operation: LAUNCH_REQUEST_OPERATION,
    heading: "新建项目",
    nodeNames: Object.freeze({})
  }),
  [PROJECT_VIDEO_APPEND_OPERATION]: Object.freeze({
    operation: PROJECT_VIDEO_APPEND_OPERATION,
    heading: "追加视频",
    nodeNames: Object.freeze({
      launch_intake: "追加需求核对",
      creation_context: "账户与目标项目核验",
      game_launch_pack: "核验指定视频",
      account_resource_prepare: "视频可用性与推送准备",
      std_project_draft_builder: "准备追加计划",
      std_project_create_executor: "确认后追加",
      readback_closer: "追加结果回查"
    }),
    nodeSubflows: Object.freeze({
      game_launch_pack: Object.freeze([]),
      account_resource_prepare: Object.freeze([]),
      std_project_draft_builder: Object.freeze([])
    }),
    nodeChildren: Object.freeze({
      game_launch_pack: Object.freeze([]),
      account_resource_prepare: Object.freeze([]),
      std_project_draft_builder: Object.freeze([])
    })
  })
});

export function operationContract(operation = LAUNCH_REQUEST_OPERATION) {
  return LAUNCH_OPERATION_CONTRACTS[operation] || LAUNCH_OPERATION_CONTRACTS[LAUNCH_REQUEST_OPERATION];
}
