# Committee & Signatures

Chairman/Secretary/Treasurer roles and their signature images, used on issued
receipts.

## Roles

`Society.chairmanId`/`secretaryId`/`treasurerId` each link to an existing
`OWNER` `User`. Managed from Settings → Committee. Each role can independently
be unassigned.

## Signature images

`chairmanSignatureFileKey`/`secretarySignatureFileKey` on `Society`, plus a
separate `receiptSignatureFileKey` for the treasurer (kept as a Committee-tab
record only — not read anywhere in receipt rendering). Upload/remove/view via
`server/src/features/society-settings/committee-signature-service.ts`
(`setCommitteeSignature`/`removeCommitteeSignature`/
`getCommitteeSignatureForViewing`), stored through the same `StorageAdapter`
every other upload uses (`docs/features/file-storage.md`).

Replace ordering: save the new file → point `Society` at it → delete the old
file. Never delete-then-save, so a failure mid-replace can't leave Settings
pointing at a file that no longer exists.

## Receipt signing

A receipt shows two signatory blocks side by side — Chairman and Secretary —
using each role's real name and signature image. Either role may be
unassigned or unsigned; that block renders a blank line instead. If a
configured signature file can't be read at render time (deleted out of band,
adapter misconfigured), the same blank-line fallback applies, logged as a
warning — a broken signature image never blocks a payment from settling.

**Approving a Deposit is blocked if neither Chairman nor Secretary has a
signature configured.** A receipt is issued at the moment of approval
(`docs/features/receipts.md`); a receipt with a completely blank signatory
block isn't acceptable output. This is narrower than the "broken file at
render time" fallback above — that covers a signature that *is* configured
but unreadable; this covers *nothing ever being configured*. Either role
alone is enough to unblock approval.

Mechanism: `SignaturesNotConfiguredError` (`server/src/shared/errors/errors.ts`),
thrown by `receipt.service.ts`'s `assertSignaturesConfigured`, called from both
the receipt-preview endpoint and the real approve/`manualDeposit` paths before
either commits anything — a block has zero side effects (no status change, no
`Receipt` row, no audit entry). Mapped to `409`.
