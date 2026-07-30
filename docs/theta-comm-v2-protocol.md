# Theta-Comm V2 Protocol

Theta-Comm conversations are a separate product domain from Theta-Space
community groups. A `GROUP` encrypted chat is never a `Group`, `GroupMember`,
group forum, or group media record.

## Security Boundary

- Message bodies, edits, reactions, filenames, media descriptors, thumbnails,
  and attachment bytes are encrypted on the sender device.
- The service stores ciphertext, routing metadata, membership, timestamps, and
  delivery acknowledgements. It never receives a plaintext message mirror.
- Authenticated server event-stream wakeups contain only opaque routing and
  sync hints. Device notifications contain no message content.
- The database, event stream, and encrypted blob store run on the Theta-Space
  server. Theta-Comm does not require an external database, push provider, or
  object-storage service.
- Each device owns an identity key, signed prekey, and rotating one-time
  prekeys. Private key material never leaves the device.
- Device registration publishes signed classical and post-quantum Kyber prekeys for PQXDH.
- Recipient envelopes carry the intended device key version. The service
  rejects stale-key submissions so the sender must refresh after an identity
  rotation.
- One-time prekey replenishment uses authoritative server availability rather
  than the device's local inventory.
- Every active recipient device, except the sending device that already has the local plaintext,
  receives its own Signal Protocol envelope.
  Group chats use the same per-device envelope model so removing a member
  prevents that member's devices from receiving future epochs.

## Message Lifecycle

1. The client writes a message locally with a UUID `clientMessageId` and
   `QUEUED` state.
2. Media is encrypted locally and uploaded as opaque chunks when necessary.
   JPEG images are normalized, large MP4 videos are compressed before
   encryption, and chunked uploads and range downloads resume after interruption.
3. WorkManager creates recipient envelopes and submits the message with the
   client UUID.
4. The service atomically assigns a conversation sequence and returns the same
   record for repeated `(senderDeviceId, clientMessageId)` submissions.
5. The sender moves the local state to `SENT`.
6. Recipient devices acknowledge `DELIVERED` after persisting and decrypting
   the envelope.
7. Recipient devices acknowledge `SEEN` after rendering it in an open
   conversation.

`DELIVERED` requires a signed-in Theta-Comm device acknowledgement. A server
event, notification, or accepted upload never counts as delivery.

## Group Membership

- Chat groups have `OWNER`, `ADMIN`, and `MEMBER` roles.
- Every membership change increments `membershipVersion`.
- Send requests with stale membership versions are rejected and must resync.
- The owner can appoint administrators. Administrators can add and remove
  members but cannot remove or demote the owner.
- Leaving or removing a member ends access to future envelopes. Previous
  history remains only on devices that already received it.
- Group names and group images travel as encrypted per-device metadata events.
  Group image bytes, thumbnails, filenames, and keys are never stored in
  plaintext by the service.

## Linked Devices

- A newly registered or identity-rotated device receives new messages only.
- The server filters sync history at the device key-registration boundary.
- Messages sent from one active device are encrypted to the account's other
  active devices, so future activity remains synchronized.
- Device identity changes invalidate prior trust and stale recipient
  envelopes.

## Product Limits

- Maximum participants: 100.
- Maximum devices per member: 10.
- Maximum encrypted attachments per message: 10.
- Maximum encrypted attachment size: 250 MiB.
- Upload chunk size: 5 MiB.
- Edit window: 15 minutes.
- Delete-for-everyone window: 48 hours.
- Typing state expires after 8 seconds and is never persisted as history.

## Compatibility

V1 RSA envelopes remain readable by the legacy application during migration.
V2 writers must not send `desktopMirrorBody`. Desktop and future iOS clients
must implement this protocol and consume the same per-device envelope APIs.
