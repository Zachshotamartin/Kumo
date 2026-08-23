import { verifyDeploymentSmoke } from "../src/server/deploymentSmoke.ts";

const deploymentUrl = process.argv[2];
if (!deploymentUrl) throw new Error("Usage: node scripts/verify-deployment-smoke.mjs <deployment-url>");

const result = await verifyDeploymentSmoke(deploymentUrl);
console.log(`Deployment smoke checks passed (app ${result.rootStatus}, protected API ${result.sessionStatus}).`);
