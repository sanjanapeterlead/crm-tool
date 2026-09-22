@AGENTS.md

# Architecture

Read `ARCHITECTURE.md` before making a structural change (new migration,
new integration, new service file, new top-level route, changed permission
model). It is the maintained mental model of this codebase — high-level
design (request lifecycle, RLS-vs-admin-client split, the integration
boundary pattern) and low-level design (directory map, schema by migration,
conventions, testing strategy).

Update `ARCHITECTURE.md` as part of the same change, not a follow-up,
whenever you make one of the changes listed above — see its own "Keeping
this current" section for exactly what qualifies. If nothing in that section
applies, don't touch the file.
