import type { VercelRequest, VercelResponse } from "@vercel/node";
import assets from "./handlers/assets.js";
import boardPreview from "./handlers/board-preview.js";
import boards from "./handlers/boards.js";
import branches from "./handlers/branches.js";
import collaborators from "./handlers/collaborators.js";
import coverage from "./handlers/coverage.js";
import friends from "./handlers/friends.js";
import liveblocksAuth from "./handlers/liveblocks-auth.js";
import migrateBoard from "./handlers/migrate-board.js";
import profile from "./handlers/profile.js";
import product from "./handlers/product.js";
import session from "./handlers/session.js";
import shareBoard from "./handlers/share-board.js";
import telemetry from "./handlers/telemetry.js";
import versions from "./handlers/versions.js";
import platform from "./handlers/platform.js";
import maintenance from "./handlers/maintenance.js";
import { applyApiSecurityHeaders } from "./_security.js";

type ApiHandler = (request: VercelRequest, response: VercelResponse) => unknown;

/**
 * Routes are held in a `Map` rather than a plain object so a request path can never reach an
 * inherited member such as `constructor` or `__proto__` through dynamic property lookup.
 */
export const apiHandlers: ReadonlyMap<string, ApiHandler> = new Map<string, ApiHandler>([
  ["assets", assets],
  ["board-preview", boardPreview],
  ["boards", boards],
  ["branches", branches],
  ["collaborators", collaborators],
  ["coverage", coverage],
  ["friends", friends],
  ["liveblocks-auth", liveblocksAuth],
  ["migrate-board", migrateBoard],
  ["maintenance", maintenance],
  ["profile", profile],
  ["product", product],
  ["platform", platform],
  ["session", session],
  ["share-board", shareBoard],
  ["telemetry", telemetry],
  ["versions", versions],
]);

export const apiRouteName = (path: string | string[] | undefined): string =>
  Array.isArray(path) ? path.join("/") : path ?? "";

export default function routeApiRequest(request: VercelRequest, response: VercelResponse) {
  applyApiSecurityHeaders(response);
  const route = apiRouteName(request.query.path);
  const handler = apiHandlers.get(route);
  if (typeof handler !== "function") return response.status(404).json({ error: "API route not found." });
  return handler(request, response);
}
