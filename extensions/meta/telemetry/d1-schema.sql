-- Cloudflare D1 Database Schema for ELG Kit Telemetry & Attribution

CREATE TABLE IF NOT EXISTS edge_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  click_id TEXT NOT NULL UNIQUE,
  member_slug TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  referrer TEXT,
  country TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_edge_clicks_member ON edge_clicks(member_slug);
CREATE INDEX IF NOT EXISTS idx_edge_clicks_created ON edge_clicks(created_at);

CREATE TABLE IF NOT EXISTS edge_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  click_id TEXT NOT NULL,
  member_slug TEXT NOT NULL,
  event_name TEXT NOT NULL,
  pipeline_value REAL NOT NULL DEFAULT 0.0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (click_id) REFERENCES edge_clicks(click_id)
);

CREATE INDEX IF NOT EXISTS idx_edge_conversions_click ON edge_conversions(click_id);

-- Query 1: Top Employee Advocates by Verified Human Clicks (Last 30 Days)
-- SELECT 
--   member_slug,
--   COUNT(*) AS total_clicks,
--   SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) AS human_clicks,
--   ROUND(SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) * 0.62) AS estimated_verified_reads
-- FROM edge_clicks
-- WHERE created_at >= datetime('now', '-30 days')
-- GROUP BY member_slug
-- ORDER BY human_clicks DESC;

-- Query 2: Executive Pipeline Attribution by Employee (Last 90 Days)
-- SELECT 
--   c.member_slug,
--   COUNT(DISTINCT c.click_id) AS attributing_clicks,
--   COUNT(v.id) AS total_conversions,
--   SUM(v.pipeline_value) AS attributed_pipeline_usd
-- FROM edge_clicks c
-- JOIN edge_conversions v ON c.click_id = v.click_id
-- WHERE c.is_bot = 0 AND c.created_at >= datetime('now', '-90 days')
-- GROUP BY c.member_slug
-- ORDER BY attributed_pipeline_usd DESC;
