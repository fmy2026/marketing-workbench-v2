import { buildAccountResourceOncePlan } from "../src/platforms/oceanengineAccountResourceAdapter.mjs";

console.log(JSON.stringify(await buildAccountResourceOncePlan("event_asset"), null, 2));
