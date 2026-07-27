import assert from "node:assert/strict";
import test from "node:test";
import { signupSchema } from "@/modules/auth-security/types";

test("signup validation attributes username format errors to username", () => {
  const result = signupSchema.safeParse({
    inviteCode: "TS-FREE-ABC123",
    displayName: "Test Member",
    username: "test member",
    email: "member@example.com",
    password: "A-valid-password-123"
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.issues[0]?.path[0], "username");
  assert.equal(result.error.issues[0]?.message, "Use letters, numbers, and underscores only.");
});
