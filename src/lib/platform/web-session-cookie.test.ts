import assert from "node:assert/strict";
import test from "node:test";
import { forceBrowserScopedAuthSessionCookies, makeAuthSessionCookieBrowserScoped } from "./web-session-cookie";

test("web auth session cookies are stripped back to browser-scoped cookies", () => {
  assert.equal(
    makeAuthSessionCookieBrowserScoped(
      "__Secure-authjs.session-token=abc; Path=/; Expires=Wed, 05 Aug 2026 12:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
    ),
    "__Secure-authjs.session-token=abc; Path=/; HttpOnly; Secure; SameSite=Lax"
  );

  assert.equal(
    makeAuthSessionCookieBrowserScoped(
      "__Secure-authjs.session-token.0=abc; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax"
    ),
    "__Secure-authjs.session-token.0=abc; Path=/; HttpOnly; Secure; SameSite=Lax"
  );
});

test("non-session auth helper cookies keep their intended expiration", () => {
  const csrf = "__Host-authjs.csrf-token=abc; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax";

  assert.equal(makeAuthSessionCookieBrowserScoped(csrf), csrf);
});

test("auth responses preserve helper cookies while hardening session cookies", () => {
  const response = new Response("ok", {
    headers: [
      [
        "set-cookie",
        "__Secure-authjs.session-token=abc; Path=/; Expires=Wed, 05 Aug 2026 12:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
      ],
      ["set-cookie", "__Host-authjs.csrf-token=def; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax"]
    ]
  });

  const setCookies = forceBrowserScopedAuthSessionCookies(response).headers.getSetCookie?.();

  assert.deepEqual(setCookies, [
    "__Secure-authjs.session-token=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
    "__Host-authjs.csrf-token=def; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax"
  ]);
});
