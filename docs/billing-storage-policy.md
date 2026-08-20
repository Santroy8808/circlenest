# Billing and Storage Downgrades

## Current behavior

- Contributor personal storage is currently **2 GiB**.
- Free personal storage is currently **200 MiB** for personal uploaded media, including Gallery files, group uploads, and message images. Text-only posts do not count toward this file quota.
- Cancellation is configured to take effect at the end of the current paid billing period. The account keeps its paid access until that date.
- The Subscription page shows a warning before opening Stripe billing management. The user must choose **Continue to billing** after reviewing the storage consequence; **Keep subscription** closes the warning without leaving Theta-Space.
- When the downgrade takes effect, the membership quota is changed to the Free limit. If the member is over the limit, Theta-Space selects the oldest excess media first and places it in a durable storage archive.
- Archived image media is re-encoded at a substantially smaller size. Other supported files are compressed before archive storage when that reduces their size. The original active object is removed only after the archive object and its preview have been written successfully.
- Archived items no longer count toward the active personal-storage quota. Their Gallery entry remains as a small preview rather than the full file.
- A member can prepare one archived file at a time for temporary full-file viewing. Requests are placed behind normal platform work and expire after 15 minutes or when the member closes the prepared view.
- A member can request all archived items as a ZIP file. The ZIP is generated in the background, and a Theta-Space notification directs the member to the owner-only download. Download links remain available for seven days.
- Account deletion is a separate destructive workflow. It removes the account's media and related records; a storage downgrade does not.

## Example

An account with 750 MB of active media moves from Contributor to Free. Theta-Space keeps up to the 200 MiB active limit and processes the oldest excess media into the storage archive. Those items remain recoverable through one-at-a-time prepared viewing or a ZIP download; they are not silently deleted.

## Product expectations

The Subscription experience must clearly show the post-cancellation limit, current usage, archive state, and archive-download option. Account deletion remains a separate destructive workflow and must remove both active media and storage-archive objects.
