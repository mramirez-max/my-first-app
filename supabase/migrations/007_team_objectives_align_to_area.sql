-- Migration 007: Fix team_objectives.aligned_to to reference area_objectives
-- Team OKRs align to Operations area OKRs, not company OKRs.
-- Hierarchy: Company OKRs → Area OKRs → Team OKRs

ALTER TABLE team_objectives DROP COLUMN IF EXISTS aligned_to;
ALTER TABLE team_objectives ADD COLUMN aligned_to uuid REFERENCES area_objectives(id) ON DELETE SET NULL;
