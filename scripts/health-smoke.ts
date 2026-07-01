const baseUrl = (process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const endpoints = ["/health/live", "/health/version", "/health/ready"];

async function checkEndpoint(path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  if (!body?.ok) {
    throw new Error(`${path} did not return ok=true: ${JSON.stringify(body)}`);
  }
  console.log(`[health-smoke] ${path} ok`);
}

async function main() {
  for (const endpoint of endpoints) {
    await checkEndpoint(endpoint);
  }
}

main().catch((error) => {
  console.error("[health-smoke] failed", error);
  process.exit(1);
});
