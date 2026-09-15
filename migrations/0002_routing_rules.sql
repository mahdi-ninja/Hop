-- JSON array of routing rules (see docs/API.md); NULL means the link has none.
ALTER TABLE links ADD COLUMN rules TEXT;
