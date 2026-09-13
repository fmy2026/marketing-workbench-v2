import { createWorkbenchServer } from "./workbenchServer.mjs";

const { server, networkPolicy } = createWorkbenchServer();
server.listen(networkPolicy.bindPort, networkPolicy.bindHost, () => {
  console.log(`marketing-workbench-v2 listening on ${networkPolicy.bindOrigin}/ for ${networkPolicy.publicOrigin}/`);
});

export { workflowReportScope } from "./workbenchServer.mjs";
