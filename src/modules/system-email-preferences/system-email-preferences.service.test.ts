import assert from "node:assert/strict";
import test from "node:test";
import "../../../scripts/load-next-env";
import {
  buildOptionalSystemEmailUnsubscribeHtml,
  buildOptionalSystemEmailUnsubscribeText,
  createOptionalSystemEmailUnsubscribeToken,
  inspectOptionalSystemEmailUnsubscribeToken
} from "@/modules/system-email-preferences/system-email-preferences.service";

test("optional system email unsubscribe token round-trips the normalized email", () => {
  const token = createOptionalSystemEmailUnsubscribeToken("Member@Example.com");
  const details = inspectOptionalSystemEmailUnsubscribeToken(token);

  assert.ok(details);
  assert.equal(details.email, "member@example.com");
  assert.match(details.maskedEmail, /^me/);
});

test("optional system email unsubscribe token rejects tampering", () => {
  const token = createOptionalSystemEmailUnsubscribeToken("member@example.com");
  const [payload, signature] = token.split(".");
  const tampered = `${payload}.${signature}tampered`;

  assert.equal(inspectOptionalSystemEmailUnsubscribeToken(tampered), null);
});

test("optional system email unsubscribe copy includes the hosted unsubscribe link", () => {
  const text = buildOptionalSystemEmailUnsubscribeText("member@example.com");
  const html = buildOptionalSystemEmailUnsubscribeHtml("member@example.com");

  assert.match(text, /unsubscribe/i);
  assert.match(text, /required account, login, and security emails/i);
  assert.match(text, /https?:\/\/.*\/unsubscribe\?token=/i);
  assert.match(html, /Unsubscribe/i);
  assert.match(html, /required account, login, and security emails/i);
  assert.match(html, /\/unsubscribe\?token=/i);
});
