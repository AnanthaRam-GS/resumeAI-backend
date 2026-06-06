CREATE TABLE IF NOT EXISTS portfolio_items (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	item_type resumeai_portfolio_item_type NOT NULL,
	title TEXT NOT NULL,
	organization TEXT,
	description TEXT,
	start_date DATE,
	end_date DATE,
	is_current BOOLEAN NOT NULL DEFAULT FALSE,
	location TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolio_items_user_id_idx ON portfolio_items (user_id);
CREATE INDEX IF NOT EXISTS portfolio_items_item_type_idx ON portfolio_items (item_type);
CREATE INDEX IF NOT EXISTS portfolio_items_user_id_item_type_idx ON portfolio_items (user_id, item_type);

DROP TRIGGER IF EXISTS portfolio_items_set_updated_at ON portfolio_items;
CREATE TRIGGER portfolio_items_set_updated_at
BEFORE UPDATE ON portfolio_items
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
