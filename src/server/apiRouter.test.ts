import { readdirSync, readFileSync } from "node:fs";
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

  it("runs lifecycle maintenance on a Hobby-compatible daily cron", () => {
    expect(vercelConfig.crons).toEqual([
      { path: "/api/maintenance", schedule: "0 3 * * *" },
    ]);
  });

  it("keeps the production collaboration canary compatible with verified-email enforcement", () => {
    const canary = readFileSync(join(process.cwd(), "scripts", "verify-product-collaboration.mjs"), "utf8");
    const purge = readFileSync(join(process.cwd(), "scripts", "purge-full-stack-canary-artifacts.mjs"), "utf8");
    const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "ci-cd.yml"), "utf8");
    expect(canary).toContain('createVerifiedCanaryAccount(label, firebaseAdmin');
    expect(canary).toContain('required("FIREBASE_SERVICE_ACCOUNT_JSON")');
    expect(canary).toContain('identityUrl("signInWithPassword")');
    expect(canary).toContain('fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`');
    expect(canary).not.toContain('identityUrl("signUp")');
    expect(canary).not.toContain('getByLabel("Email")');
    expect(canary).not.toContain('getByLabel("Password")');
    expect(canary).toContain("cleanupFullStackCanaryArtifacts({");
    expect(canary).toContain('deleteBoard: (boardId) => deleteSupabaseRows("boards", "id", boardId)');
    expect(canary).toContain("assertFullStackCanaryOutcome(verificationError, cleanupError)");
    expect(canary).not.toContain("catch(() => undefined)");
    expect(purge).toContain('isFullStackCanaryEmail(profile.email)');
    expect(purge).toContain('if (!apply)');
    expect(purge.indexOf('required("FIREBASE_SERVICE_ACCOUNT_JSON")'))
      .toBeLessThan(purge.indexOf("liveblocks.deleteRoom(roomId)"));
    expect(purge.indexOf('required("FIREBASE_SERVICE_ACCOUNT_JSON")'))
      .toBeLessThan(purge.indexOf('supabase.from("boards").delete()'));
    expect(workflow).toContain('FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_KUMO_7D8E1 }}');
    const previewWorkflow = workflow.slice(workflow.indexOf("  preview:"), workflow.indexOf("  production:"));
    expect(previewWorkflow).toContain('- name: Run authenticated preview canary');
    expect(previewWorkflow).toContain('yarn verify:authenticated-canary "https://$VERCEL_VALIDATION_DOMAIN"');
    const productionWorkflow = workflow.slice(workflow.indexOf("  production:"));
    expect(productionWorkflow).toContain('- name: Run authenticated production canary');
    expect(productionWorkflow).toContain('FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_KUMO_7D8E1 }}');
    expect(workflow.match(/run: yarn verify:remote-schema/g)).toHaveLength(2);
    expect(workflow.indexOf("run: yarn verify:remote-schema")).toBeLessThan(workflow.indexOf("Build preview artifacts"));
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
      "coverage",
      "friends",
      "liveblocks-auth",
      "maintenance",
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
