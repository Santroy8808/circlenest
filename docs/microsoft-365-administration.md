# Microsoft 365 Administration

## Account roles

- `admin@santroy8808.onmicrosoft.com` is the Theta-Space Microsoft 365 tenant administrator. Use it for Microsoft Graph, Exchange, tenant, connector, and shared-mailbox administration.
- `theta@theta-space.net` is an operational mailbox account, not a tenant administrator. Shared mailboxes are managed by the tenant administrator and delegated to `theta@theta-space.net` with the least access needed, normally Full Access and Send As.

## Shared mailboxes

Shared mailboxes must not be used as direct sign-in accounts. Create and administer them through the tenant administrator, then grant mailbox-only permissions to `theta@theta-space.net`.

`billing@theta-space.net` is the invoice sender and retained billing copy. Subscription receipts are sent from this address and copied to this mailbox for accounting review.
