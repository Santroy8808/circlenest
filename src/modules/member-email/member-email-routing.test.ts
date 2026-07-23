import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemberMailRoute,
  createOutboundMemberMailEnvelope,
  parseMemberMailRoute
} from "@/modules/member-email/member-email-routing";

const baseAddress = "theta@theta-space.net";
const immutableUserId = "cmember7f29a1";

test("member mail address is derived only from the immutable user ID", () => {
  assert.deepEqual(createMemberMailRoute(immutableUserId, baseAddress), {
    userId: immutableUserId,
    tag: immutableUserId,
    baseAddress,
    address: `theta+${immutableUserId}@theta-space.net`
  });
});

test("member mail route rejects addresses outside the shared mailbox", () => {
  assert.equal(parseMemberMailRoute(`member+${immutableUserId}@theta-space.net`, baseAddress), null);
  assert.equal(parseMemberMailRoute(`theta+${immutableUserId}@example.com`, baseAddress), null);
  assert.equal(parseMemberMailRoute("theta@theta-space.net", baseAddress), null);
});

test("member mail route parses the immutable user ID from an inbound plus address", () => {
  assert.deepEqual(parseMemberMailRoute(`theta+${immutableUserId}@theta-space.net`, baseAddress), {
    userId: immutableUserId,
    tag: immutableUserId,
    baseAddress,
    address: `theta+${immutableUserId}@theta-space.net`
  });
});

test("outbound mail uses the shared mailbox and routes replies back to the member ID", () => {
  assert.deepEqual(createOutboundMemberMailEnvelope(immutableUserId, "outside@example.com", baseAddress), {
    direction: "outbound",
    ownerUserId: immutableUserId,
    from: baseAddress,
    to: ["outside@example.com"],
    replyTo: `theta+${immutableUserId}@theta-space.net`
  });
});
