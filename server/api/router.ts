import type { VercelRequest, VercelResponse } from "@vercel/node";
import assets from "./handlers/assets.js";
import boardPreview from "./handlers/board-preview.js";
import boards from "./handlers/boards.js";
import branches from "./handlers/branches.js";
import collaborators from "./handlers/collaborators.js";
import friends from "./handlers/friends.js";
import liveblocksAuth from "./handlers/liveblocks-auth.js";
import migrateBoard from "./handlers/migrate-board.js";
import profile from "./handlers/profile.js";
import product from "./handlers/product.js";
import session from "./handlers/session.js";
import shareBoard from "./handlers/share-board.js";
import versions from "./handlers/versions.js";

type ApiHandler = (request: VercelRequest, response: VercelResponse) => unknown;

export const apiHandlers: Readonly<Record<string, ApiHandler>> = {
  assets,
  "board-preview": boardPreview,
  boards,
  branches,
  collaborators,
  friends,
  "liveblocks-auth": liveblocksAuth,
  "migrate-board": migrateBoard,
  profile,
  product,
  session,
  "share-board": shareBoard,
  versions,
};

export const apiRouteName = (path: string | string[] | undefined): string =>
  Array.isArray(path) ? path.join("/") : path ?? "";

export default function routeApiRequest(request: VercelRequest, response: VercelResponse) {
  const route = apiRouteName(request.query.path);
  const handler = apiHandlers[route];
  if (!handler) return response.status(404).json({ error: "API route not found." });
  return handler(request, response);
}
