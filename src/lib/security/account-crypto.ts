import { createCipheriv, createHash, generateKeyPairSync, publicEncrypt, randomBytes } from "crypto";

function getMasterKey(): Buffer {
  const raw = process.env.SYSTEM_MASTER_KEY_BASE64;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("SYSTEM_MASTER_KEY_BASE64 must decode to 32 bytes");
    return key;
  }
  const fallbackSeed = process.env.NEXTAUTH_SECRET || "theta-space-dev-master-key";
  return createHash("sha256").update(fallbackSeed).digest();
}

function encryptWithAesGcm(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function wrapDekForPublicKey(publicKeyPem: string, dek: Buffer): string {
  const wrapped = publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: "sha256",
    },
    dek,
  );
  return wrapped.toString("base64");
}

export function createAccountCryptoMaterial() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const masterKey = getMasterKey();
  const perUserDek = randomBytes(32);
  const encryptedPrivateKey = encryptWithAesGcm(perUserDek, privateKey);
  const wrappedDekForSystem = encryptWithAesGcm(masterKey, perUserDek.toString("base64"));

  const adminPublicKeyPem = process.env.SYSTEM_ADMIN_PUBLIC_KEY_PEM;
  const wrappedDekForAdmin = adminPublicKeyPem ? wrapDekForPublicKey(adminPublicKeyPem, perUserDek) : null;

  return {
    publicKeyPem: publicKey,
    encryptedPrivateKey,
    wrappedDekForSystem,
    wrappedDekForAdmin,
  };
}
