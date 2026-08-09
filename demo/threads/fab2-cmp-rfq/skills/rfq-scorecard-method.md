# Skill: RFQ scorecard method

WHEN to use: any capital equipment RFQ scored on TCO rather than purchase price.

Steps that worked:
1. Fix the TCO horizon and cost buckets BEFORE bids arrive (purchase, install,
   consumables, service, footprint/utilities). Changing buckets after opening
   bids looks like steering.
2. Every vendor number gets a source tag: bid document page, or our own actuals.
   Vendor claims about consumables get cross-checked against Fab 1 actuals -
   they are optimistic roughly 100% of the time.
3. Normalize to cost-per-wafer-pass at the planned Fab 2 volume, then scale.
4. Score non-cost criteria (support presence, install track record, roadmap)
   separately - never blend them into the TCO number. Present both.
5. Clarifying answers go to ALL bidders the same day (auditability).

Pitfalls:
- Service escalators compound over 7 years; model the %, not year-1 $.
- Footprint differences look small until translated to cleanroom $/m2.
- Keep the scorecard in artifacts/ and version it by date - the review board
  will ask what changed between drafts.
