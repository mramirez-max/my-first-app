-- Migration 008: team_objectives.aligned_to now references area_key_results
-- Hierarchy: Company OKRs → Area OKRs → Area KRs → Team OKRs
-- A team objective should support a specific area KR, not just an area objective.

ALTER TABLE team_objectives DROP COLUMN IF EXISTS aligned_to;
ALTER TABLE team_objectives ADD COLUMN aligned_to uuid REFERENCES area_key_results(id) ON DELETE SET NULL;
