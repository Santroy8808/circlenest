import { createSign } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_PUSH_ATTEMPTS = 8;
const PUSH_LEASE_MS = 60_000;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function firebaseConfig() {
  const enabled = process.env.THETA_COMM_PUSH_ENABLED === "true";
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!enabled) return null;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Theta-Comm push is enabled but Firebase service credentials are incomplete.");
  }
  return { projectId, clientEmail, privateKey };
}

async function getFirebaseAccessToken(config: NonNullable<ReturnType<typeof firebaseConfig>>) {
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > Date.now()) {
    return cachedAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const assertion = `${signingInput}.${base64Url(signer.sign(config.privateKey))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? `Firebase authorization failed with HTTP ${response.status}.`);
  }
  cachedAccessToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000
  };
  return body.access_token;
}

function pushData(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { type: "theta_comm_sync" };
  }
  return Object.fromEntries(
    Object.entries(payload)
      .filter((entry): entry is [string, string | number | boolean] =>
        ["string", "number", "boolean"].includes(typeof entry[1])
      )
      .map(([key, value]) => [key, String(value)])
  );
}

async function sendFirebaseWakeup(
  config: NonNullable<ReturnType<typeof firebaseConfig>>,
  token: string,
  payload: Prisma.JsonValue
) {
  const accessToken = await getFirebaseAccessToken(config);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          data: pushData(payload),
          android: {
            priority: "HIGH",
            ttl: "86400s"
          }
        }
      })
    }
  );
  const responseText = await response.text();
  return {
    ok: response.ok,
    unregistered:
      response.status === 404 ||
      /UNREGISTERED|registration-token-not-registered|not a valid FCM registration token/i.test(responseText),
    error: response.ok ? null : `FCM HTTP ${response.status}: ${responseText.slice(0, 500)}`
  };
}

export async function runOneThetaCommPush(workerId: string) {
  const now = new Date();
  const staleLease = new Date(now.getTime() - PUSH_LEASE_MS);
  const candidate = await prisma.thetaCommPushOutbox.findFirst({
    where: {
      sentAt: null,
      failedAt: null,
      availableAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleLease } }]
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }]
  });
  if (!candidate) return { ran: false as const };
  const claimed = await prisma.thetaCommPushOutbox.updateMany({
    where: {
      id: candidate.id,
      sentAt: null,
      failedAt: null,
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleLease } }]
    },
    data: {
      lockedAt: now,
      lockedBy: workerId,
      attempts: { increment: 1 }
    }
  });
  if (claimed.count !== 1) return { ran: false as const };

  const outbox = await prisma.thetaCommPushOutbox.findUniqueOrThrow({
    where: { id: candidate.id },
    include: {
      userDevice: {
        include: {
          commPushRegistrations: {
            where: { enabled: true },
            orderBy: { lastSeenAt: "desc" }
          }
        }
      }
    }
  });

  try {
    const config = firebaseConfig();
    if (!config) {
      throw new Error("Theta-Comm push delivery is disabled.");
    }
    let delivered = 0;
    const errors: string[] = [];
    for (const registration of outbox.userDevice.commPushRegistrations) {
      const result = await sendFirebaseWakeup(config, registration.token, outbox.payload);
      if (result.ok) {
        delivered += 1;
        await prisma.thetaCommPushRegistration.update({
          where: { id: registration.id },
          data: { lastSeenAt: new Date() }
        });
      } else {
        errors.push(result.error ?? "Firebase rejected the push.");
        if (result.unregistered) {
          await prisma.thetaCommPushRegistration.update({
            where: { id: registration.id },
            data: { enabled: false }
          });
        }
      }
    }
    if (outbox.userDevice.commPushRegistrations.length > 0 && delivered === 0) {
      throw new Error(errors[0] ?? "No active Firebase registration accepted the push.");
    }
    await prisma.thetaCommPushOutbox.update({
      where: { id: outbox.id },
      data: {
        sentAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: errors.length > 0 ? errors.join(" | ").slice(0, 2000) : null
      }
    });
    return { ran: true as const, delivered };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Theta-Comm push delivery failed.";
    const permanentlyFailed = outbox.attempts >= MAX_PUSH_ATTEMPTS;
    const retryDelayMs = Math.min(15 * 60_000, 5_000 * 2 ** Math.max(0, outbox.attempts - 1));
    await prisma.thetaCommPushOutbox.update({
      where: { id: outbox.id },
      data: {
        lockedAt: null,
        lockedBy: null,
        lastError: message.slice(0, 2000),
        failedAt: permanentlyFailed ? new Date() : null,
        availableAt: permanentlyFailed ? outbox.availableAt : new Date(Date.now() + retryDelayMs)
      }
    });
    return { ran: true as const, delivered: 0, error: message, permanentlyFailed };
  }
}
