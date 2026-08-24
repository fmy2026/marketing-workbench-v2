import { buildAccountResourceOncePlan } from "../src/platforms/oceanengineAccountResourceAdapter.mjs";

console.log(JSON.stringify(await buildAccountResourceOncePlan("avatar"), null, 2));
