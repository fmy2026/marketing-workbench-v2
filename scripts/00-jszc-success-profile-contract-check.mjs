import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import {
  evaluateJsZcSuccessProfile,
  jszcSuccessProfileManifest
} from "../src/workflows/skills/oe3/05-jszc-success-profile.mjs";

const ROUTE_ID = "oceanengine_3_byte_mini_game";
const GAME_CODE = "JSZC";

const repo = new PostgresRepository();
const defaults = await repo.getGameRouteDefaults({ routeId: ROUTE_ID, gameCode: GAME_CODE });
if (!defaults) throw new Error("jszc_game_route_defaults_missing");

const result = evaluateJsZcSuccessProfile({ defaults });
const output = {
  status: result.status,
  routeId: ROUTE_ID,
  gameCode: GAME_CODE,
  contract: jszcSuccessProfileManifest(result),
  platformWriteCalled: false,
  rawPayloadStored: false
};

console.log(JSON.stringify(output, null, 2));
if (result.status !== "passed") process.exitCode = 1;
