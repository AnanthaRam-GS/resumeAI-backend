CREATE TABLE IF NOT EXISTS portfolio_items (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	type resumeai_portfolio_item_type NOT NULL,
	source resumeai_portfolio_item_source NOT NULL DEFAULT 'manual',
	title TEXT NOT NULL,
	description TEXT,
	start_date DATE,
	end_date DATE,
	is_current BOOLEAN NOT NULL DEFAULT FALSE,
	tech_stack TEXT[] NOT NULL DEFAULT '{}'::text[],
	project_url TEXT,
	impact_metrics TEXT,
	domain_category TEXT,
	company_name TEXT,
	employment_type TEXT,
	location TEXT,
	degree TEXT,
	field_of_study TEXT,
	institution_name TEXT,
	gpa TEXT,
	achievements TEXT,
	issuing_org TEXT,
	cert_url TEXT,
	expiry_date DATE,
	no_expiry BOOLEAN NOT NULL DEFAULT FALSE,
	skill_name TEXT,
	document_s3_key TEXT,
	document_filename TEXT,
	validation_score NUMERIC(5, 2),
	extra JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS portfolio_items_user_id_idx ON portfolio_items (user_id);
CREATE INDEX IF NOT EXISTS portfolio_items_user_id_type_idx ON portfolio_items (user_id, type);
CREATE INDEX IF NOT EXISTS portfolio_items_source_idx ON portfolio_items (source);

DROP TRIGGER IF EXISTS portfolio_items_set_updated_at ON portfolio_items;
CREATE TRIGGER portfolio_items_set_updated_at
BEFORE UPDATE ON portfolio_items
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
