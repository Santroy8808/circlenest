-- Expand first. Existing MEMBERS rows remain readable by the new application
-- until a later contract release removes that legacy value.
--
-- OPERATOR PRECONDITION: stop all previous application and worker processes
-- before the subsequent default migration or the new binary starts writing
-- PUBLIC. The previous generated client does not know that enum value.
ALTER TYPE "FeedVisibility" ADD VALUE IF NOT EXISTS 'PUBLIC';
