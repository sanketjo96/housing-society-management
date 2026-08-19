# Other Charges — Roadmap

Principle: build bottom-up — schema and shared balance logic first, since both the
admin and resident UI depend on the category-aware balance endpoints existing before
either can be built meaningfully. Unlike `docs/observablity/`'s roadmap, this feature
has no "live with it for a while before the next stage" trigger structure — it's one
cohesive feature with a natural dependency order, not a set of independently-useful
stages.

## Suggested Build Order

```
1. Schema (Epic 1)
   FeeType, OtherCharge, LedgerCategory, category columns + migration
   ── nothing downstream can be built or tested without this

2. Backend — Fee Types & Billing (Epic 2)
   The catalog + the one write path (billOtherCharge) that creates OtherCharge rows
   ── needed before any balance can be non-zero, so Epic 3's queries have real data

3. Backend — Balance/Settlement Integration (Epic 3)
   category-aware computeFlatBalances/getBalancesByFlat, the intent block error,
   manualDeposit's category param
   ── the shared layer both admin and resident UI read from; must land before either

4. Notifications (Epic 4)
   OTHER_CHARGE_BILLED event + WhatsApp template
   ── can happen in parallel with Epic 3 once Epic 2 exists; independent of the UI

5. Frontend — Admin (Epic 5)
   Fee Types page, Other Charges billing page, Dashboard cards, Payment Proofs
   Category column
   ── depends on Epics 2 and 3 being live

6. Frontend — Resident (Epic 6)
   Dashboard cards, Other Charges Book page, shared Pay-intent state
   ── depends on Epic 3 (balance summary endpoint) and benefits from Epic 5
      existing first (so there's something to actually test against — an admin
      needs to be able to bill a charge before a resident can pay one)

7. Tests (Epic 7)
   Written alongside each epic above in practice, not deferred to the end —
   listed last here only because it's the final gate before calling this done
```

## Pre-Launch Dependency: WhatsApp Template Approval

`templates/other-charge-billed.ts` (Epic 4) needs its Meta template
(`other_charge_billed`) submitted and approved before real WhatsApp sends will
succeed — same caveat already documented for `maintenance_bill_generated`,
`deposit_payment_approved`, and `credit_payment_approved` in
`docs/notification/requirements.md` §5. This is a deployment-timeline dependency,
not a code blocker: `WHATSAPP_TEST_MODE=true` lets the full pipeline (including this
new event) be proven end-to-end with Meta's pre-approved `hello_world` sample
template before the real one is approved. Submit the template as soon as Epic 4's
code is ready, not at the end of the whole feature, since Meta approval lead time
runs in parallel with the rest of the build.

## Explicit Non-Goals of This Roadmap
- Do not build escalation (flagged-flats) support for Other Charges "while we're in
  the area" — it's explicitly deferred, see `05-future-scope.md`.
- Do not build a Credit flow for Other Charges alongside the Deposit flow just
  because the maintenance pool has one — not requested, adds an entire parallel
  review path for no confirmed need.
- Do not generalize `PaymentIntent` to support multiple simultaneous open intents —
  the one-at-a-time constraint is a deliberate, confirmed simplification, not a
  placeholder for a future removal.
