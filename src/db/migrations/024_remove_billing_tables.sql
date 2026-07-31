-- 024: Remove legacy billing tables.
-- Signuture is a free application. Usage protection is handled by usage_counters.

DROP TABLE IF EXISTS stripe_webhook_events;
DROP TABLE IF EXISTS subscriptions;
