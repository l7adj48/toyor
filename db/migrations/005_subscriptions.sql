CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  zone_id UUID NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  meal_count SMALLINT NOT NULL CHECK (meal_count BETWEEN 1 AND 8),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_subscription_day
  ON customer_orders(subscription_id, delivery_date)
  WHERE subscription_id IS NOT NULL AND order_status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON subscriptions(customer_id, status);
