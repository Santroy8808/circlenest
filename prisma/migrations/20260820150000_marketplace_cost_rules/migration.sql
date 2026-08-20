INSERT INTO "PlatformCostRule" (
  "id", "key", "subject", "label", "description", "creditCost", "unitLabel", "active", "sortOrder", "metadata", "createdAt", "updatedAt"
) VALUES
  ('marketplace-cost-publish', 'marketplace.publish.base', 'MARKETPLACE_PUBLISH', 'Publish a marketplace listing', 'Waived during the marketplace beta.', 0, 'listing', true, 200, '{"betaWaived":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('marketplace-cost-renew', 'marketplace.renew.base', 'MARKETPLACE_RENEW', 'Renew a marketplace listing', 'Waived during the marketplace beta.', 0, 'renewal', true, 210, '{"betaWaived":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('marketplace-cost-promote', 'marketplace.promote.base', 'MARKETPLACE_PROMOTE', 'Promote a marketplace listing', 'Promotion remains disabled until pricing is activated.', 0, 'promotion', false, 220, '{"betaWaived":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('marketplace-cost-advertise', 'marketplace.advertise.base', 'MARKETPLACE_ADVERTISE', 'Advertise a marketplace listing', 'Advertising remains disabled until pricing is activated.', 0, 'campaign', false, 230, '{"betaWaived":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
