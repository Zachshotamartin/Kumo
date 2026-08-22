const token = process.env.VERCEL_TOKEN;
const expectedEmail = process.env.EXPECTED_VERCEL_EMAIL;

if (!token || !expectedEmail) {
  throw new Error("VERCEL_TOKEN and EXPECTED_VERCEL_EMAIL are required.");
}

const response = await fetch("https://api.vercel.com/v2/user", {
  headers: { Authorization: `Bearer ${token}` },
});
if (!response.ok) {
  throw new Error(`Vercel rejected the deployment token (${response.status}).`);
}

const result = await response.json();
const actualEmail = result.user?.email ?? result.email;
if (actualEmail?.toLowerCase() !== expectedEmail.toLowerCase()) {
  throw new Error(
    `Vercel token belongs to ${actualEmail ?? "an unknown account"}; expected ${expectedEmail}.`
  );
}

console.log(`Verified Vercel deployment account: ${actualEmail}`);
