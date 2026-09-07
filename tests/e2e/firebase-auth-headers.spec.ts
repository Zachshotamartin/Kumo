import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.use({ ignoreHTTPSErrors: true });

// Exercise the real configured policy in a browser. Bootstrap bodies match the
// Firebase proxy documents; the production smoke check also fetches live helpers.
test("app CSP stays strict while Firebase redirect and hidden iframe bootstraps can run", async ({ page }) => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  // HTTPS exercises upgrade-insecure-requests exactly as deployed, including WebKit.
  // Generate a throwaway local certificate; no signing key is kept in the repository.
  const tlsDirectory = mkdtempSync(join(tmpdir(), "kumo-auth-csp-"));
  const keyFile = join(tlsDirectory, "key.pem"), certFile = join(tlsDirectory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-keyout", keyFile, "-out", certFile], { stdio: "ignore" });
  const server = createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    for (const route of config.headers) {
      if (new RegExp("^" + route.source + "$").test(path)) {
        for (const header of route.headers) response.setHeader(header.key, header.value);
      }
    }
    if (path.endsWith(".js")) {
      response.setHeader("content-type", "text/javascript");
      response.end(`window.fireauth={iframe:{AuthRelay:{initialize:()=>{document.body.dataset.ready='iframe'}}},oauthhelper:{widget:{initialize:()=>{document.body.dataset.ready='handler'}}}};`);
      return;
    }
    response.setHeader("content-type", "text/html");
    const helper = path === "/__/auth/handler" || path === "/__/auth/iframe";
    response.end(helper ? `<!doctype html><html><head><title>Auth helper</title></head><body>
      <script src="/__/auth/runtime.js"></script>
      <script>${path.endsWith("handler") ? "var POST_BODY = '{{POST_BODY}}';fireauth.oauthhelper.widget.initialize();" : "fireauth.iframe.AuthRelay.initialize();"}</script>
      </body></html>` : `<!doctype html><html><head><title>Kumo</title></head><body>
      <script>document.body.dataset.unsafe='executed';</script>
      <iframe title="Firebase auth" src="/__/auth/iframe"></iframe></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `https://127.0.0.1:${address.port}`;
  try {
    await page.goto(origin);
    await expect(page.locator("body")).not.toHaveAttribute("data-unsafe", "executed");
    await expect(page.frameLocator("iframe").locator("body")).toHaveAttribute("data-ready", "iframe");
    await page.goto(origin + "/__/auth/handler");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "handler");
  } finally {
    rmSync(tlsDirectory, { recursive: true, force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
