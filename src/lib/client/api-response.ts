function boundedMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const message = value.trim();
  return message ? message.slice(0, 300) : null;
}

export async function readJsonObject(response: Response) {
  try {
    const text = await response.text();
    if (!text) return null;
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function stableErrorFromPayload(payload: Record<string, unknown> | null, fallback: string) {
  return boundedMessage(payload?.error) ?? fallback;
}

export async function stableApiError(response: Response, fallback: string) {
  return stableErrorFromPayload(await readJsonObject(response), fallback);
}
