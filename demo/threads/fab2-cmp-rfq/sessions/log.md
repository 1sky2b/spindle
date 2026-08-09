# Session log - Fab 2 CMP tool RFQ

## You - {{TS-4d}}

Set up the TCO scorecard for the CMP RFQ before the bids land. Use the method we used on the wet bench RFQ.

## Agent - {{TS-4d}}

Built the scorecard skeleton and saved it to `artifacts/{{D-4}}-cmp-rfq-scorecard.md`. Structure follows the RFQ scorecard method:

- 7-year TCO horizon, five buckets: purchase, install, consumables, service, footprint/utilities
- Consumables lines pre-filled with **Fab 1 CMP actuals** as the cross-check column, so optimistic vendor claims surface immediately
- Non-cost criteria (support presence in Ireland, install track record, roadmap) scored separately - not blended into TCO
- Every cell has a source-tag column, empty until a bid page or an actual fills it

Also wrote the method itself into `skills/rfq-scorecard-method.md` so the next RFQ starts from the same playbook instead of re-deriving it.

## You - {{TS-3d}}

Ebara asked about the utility spec. Handle it.

## Agent - {{TS-3d}}

Handled per the auditability rule: drafted the utility-spec clarification (power, UPW, drain capacity for the Fab 2 bay) and prepared it addressed to **both** bidders, not just Ebara - same content, same day. It went out via the RFQ mailbox; noted in memory with the date.

Bids remain due {{D+10}}. When they arrive I'll populate the scorecard and flag any consumables claim that deviates more than 10% from Fab 1 actuals. The capital review board recommendation is due one week before the second Wednesday next month - the timeline still has slack.
