CREATE UNIQUE INDEX IF NOT EXISTS portfolio_research_paper_user_doi_uidx
  ON portfolio_items (
    user_id,
    lower(regexp_replace(btrim(coalesce(extra->>'doi', '')), '^https?://(dx\.)?doi\.org/', '', 'i'))
  )
  WHERE type = 'research_paper'
    AND btrim(coalesce(extra->>'doi', '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_research_paper_user_arxiv_uidx
  ON portfolio_items (
    user_id,
    regexp_replace(regexp_replace(lower(btrim(coalesce(extra->>'arxivUrl', ''))), '^https?://(www\.)?arxiv\.org/(abs|pdf)/', ''), '\.pdf$', '')
  )
  WHERE type = 'research_paper'
    AND btrim(coalesce(extra->>'arxivUrl', '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_research_paper_user_publication_url_uidx
  ON portfolio_items (
    user_id,
    regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(extra->>'publicationUrl', project_url, ''))), '^https?://', ''), '^www\.', ''), '/+$', '')
  )
  WHERE type = 'research_paper'
    AND btrim(coalesce(extra->>'publicationUrl', project_url, '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_research_paper_user_title_year_uidx
  ON portfolio_items (
    user_id,
    lower(regexp_replace(btrim(title), '\s+', ' ', 'g')),
    btrim(coalesce(extra->>'year', ''))
  )
  WHERE type = 'research_paper'
    AND btrim(title) <> ''
    AND btrim(coalesce(extra->>'year', '')) <> '';
