import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import vercelConfig from "../../vercel.json";
import vercelDevConfig from "../../vercel.dev.json";
import routeApiRequest, { apiHandlers, apiRouteName } from "../../server/api/router";

const response = () => ({
  statusCode: 200,
  body: null as unknown,
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; return this; },
});

describe("consolidated Vercel API router", () => {
  it("keeps the deployment below the Hobby-plan function limit", () => {
    const apiDirectory = join(process.cwd(), "api");
    const entries = readdirSync(apiDirectory).filter((entry) => entry.endsWith(".ts")).sort();
    expect(entries).toEqual(["liveblocks-webhook.ts", "router.ts"]);
    expect(entries.length).toBeLessThanOrEqual(12);
  });

  it("routes API requests before the single-page-app fallback", () => {
    expect(vercelConfig.rewrites[0]).toEqual({
      source: "/api/:path",
      destination: "/api/router?path=:path",
    });
    expect(vercelConfig.rewrites.at(-1)).toEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
    expect(vercelDevConfig.rewrites).toContainEqual(vercelConfig.rewrites[0]);
  });

  it("preserves every public JSON API route behind the catch-all", () => {
    expect(Object.keys(apiHandlers).sort()).toEqual([
      "assets",
      "board-preview",
      "boards",
      "branches",
      "collaborators",
      "friends",
      "liveblocks-auth",
      "migrate-board",
      "platform",
      "product",
      "profile",
      "session",
      "share-board",
      "telemetry",
      "versions",
    ]);
    expect(apiRouteName(["board-preview"])).toBe("board-preview");
    expect(apiRouteName("boards")).toBe("boards");
    expect(apiRouteName(undefined)).toBe("");
  });

  it("dispatches a known route and returns its result", () => {
    const testHandler = vi.fn(() => "handled");
    const mutableHandlers = apiHandlers as Record<string, typeof testHandler>;
    mutableHandlers.test = testHandler;
    const result = response();
    expect(routeApiRequest(
      { query: { path: "test" } } as unknown as VercelRequest,
      result as unknown as VercelResponse
    )).toBe("handled");
    expect(testHandler).toHaveBeenCalledWith(expect.any(Object), result);
    delete mutableHandlers.test;
  });

  it("returns structured 404 responses for unknown API paths", () => {
    const result = response();
    routeApiRequest(
      { query: { path: ["unknown"] } } as unknown as VercelRequest,
      result as unknown as VercelResponse
    );
    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: "API route not found." });
  });
});
