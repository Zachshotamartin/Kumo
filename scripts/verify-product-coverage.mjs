import { fetchCoverageVerification, parseCoverageCliArguments } from "../src/server/productCoverageCli.ts";

try {
  const options = parseCoverageCliArguments(process.argv.slice(2), process.env);
  const verification = await fetchCoverageVerification(options);
  process.stdout.write(`${verification.report}\n`);
  if (verification.failure) {
    process.stderr.write(`${verification.failure}\n`);
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Product coverage verification failed."}\n`);
  process.exitCode = 2;
}
