// Internals shared between settings-service.ts and committee-signature-service.ts —
// row-shaping (toSettings) and per-role column-mapping helpers.

export interface CommitteeMemberSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// Treasurer reuses the existing receiptSignatureFileKey/receiptSignatureMimeType
// columns rather than getting its own.
export type CommitteeRole = 'CHAIRMAN' | 'SECRETARY' | 'TREASURER';

export interface SignatureColumns {
  chairmanSignatureFileKey: string | null;
  chairmanSignatureMimeType: string | null;
  secretarySignatureFileKey: string | null;
  secretarySignatureMimeType: string | null;
  receiptSignatureFileKey: string | null;
  receiptSignatureMimeType: string | null;
}

export function committeeSignatureUpdateData(
  role: CommitteeRole,
  key: string | null,
  mimeType: string | null,
) {
  switch (role) {
    case 'CHAIRMAN':
      return { chairmanSignatureFileKey: key, chairmanSignatureMimeType: mimeType };
    case 'SECRETARY':
      return { secretarySignatureFileKey: key, secretarySignatureMimeType: mimeType };
    case 'TREASURER':
      return { receiptSignatureFileKey: key, receiptSignatureMimeType: mimeType };
  }
}

export function readCommitteeSignatureFileKey(
  society: SignatureColumns,
  role: CommitteeRole,
): string | null {
  switch (role) {
    case 'CHAIRMAN':
      return society.chairmanSignatureFileKey;
    case 'SECRETARY':
      return society.secretarySignatureFileKey;
    case 'TREASURER':
      return society.receiptSignatureFileKey;
  }
}

export function readCommitteeSignatureMimeType(
  society: SignatureColumns,
  role: CommitteeRole,
): string | null {
  switch (role) {
    case 'CHAIRMAN':
      return society.chairmanSignatureMimeType;
    case 'SECRETARY':
      return society.secretarySignatureMimeType;
    case 'TREASURER':
      return society.receiptSignatureMimeType;
  }
}

export interface SocietySettings {
  name: string;
  address: string;
  // "YYYY-MM-DD" date strings — time-of-day is never meaningful for either.
  constructionDate: string | null;
  formationDate: string | null;
  // UPI always takes precedence over bank details when both are configured.
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: number;
  defaultBaseRate: number;
  receiptNumberPrefix: string;
  receiptFooterNote: string | null;
  // hasXSignature flags, not the raw storage keys — bytes are only served through
  // the authenticated GET /api/admin/settings/committee/:role/signature endpoint.
  hasChairmanSignature: boolean;
  hasSecretarySignature: boolean;
  hasTreasurerSignature: boolean;
  // Each nullable, independently set from a dropdown of this society's owners.
  // Informational only; nothing in billing or permissions reads these.
  chairman: CommitteeMemberSummary | null;
  secretary: CommitteeMemberSummary | null;
  treasurer: CommitteeMemberSummary | null;
}

interface CommitteeMemberRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface SocietyRow extends SignatureColumns {
  name: string;
  address: string;
  constructionDate: Date | null;
  formationDate: Date | null;
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  tenantRateFactor: unknown;
  defaultBaseRate: unknown;
  receiptNumberPrefix: string;
  receiptFooterNote: string | null;
  chairman: CommitteeMemberRow | null;
  secretary: CommitteeMemberRow | null;
  treasurer: CommitteeMemberRow | null;
}

const COMMITTEE_MEMBER_SELECT = {
  select: { id: true, name: true, email: true, phone: true },
} as const;

export const SETTINGS_SELECT = {
  name: true,
  address: true,
  constructionDate: true,
  formationDate: true,
  upiVpa: true,
  bankAccountNumber: true,
  bankIfsc: true,
  tenantRateFactor: true,
  defaultBaseRate: true,
  receiptNumberPrefix: true,
  receiptFooterNote: true,
  receiptSignatureFileKey: true,
  receiptSignatureMimeType: true,
  chairmanSignatureFileKey: true,
  chairmanSignatureMimeType: true,
  secretarySignatureFileKey: true,
  secretarySignatureMimeType: true,
  chairman: COMMITTEE_MEMBER_SELECT,
  secretary: COMMITTEE_MEMBER_SELECT,
  treasurer: COMMITTEE_MEMBER_SELECT,
} as const;

// Date-only fields are stored as DateTime (midnight UTC) but never shown/edited
// with a time component — always rendered back as "YYYY-MM-DD".
function toDateString(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function toSettings(society: SocietyRow): SocietySettings {
  return {
    name: society.name,
    address: society.address,
    constructionDate: toDateString(society.constructionDate),
    formationDate: toDateString(society.formationDate),
    upiVpa: society.upiVpa,
    bankAccountNumber: society.bankAccountNumber,
    bankIfsc: society.bankIfsc,
    tenantRateFactor: Number(society.tenantRateFactor),
    defaultBaseRate: Number(society.defaultBaseRate),
    receiptNumberPrefix: society.receiptNumberPrefix,
    receiptFooterNote: society.receiptFooterNote,
    hasChairmanSignature: !!readCommitteeSignatureFileKey(society, 'CHAIRMAN'),
    hasSecretarySignature: !!readCommitteeSignatureFileKey(society, 'SECRETARY'),
    hasTreasurerSignature: !!readCommitteeSignatureFileKey(society, 'TREASURER'),
    chairman: society.chairman,
    secretary: society.secretary,
    treasurer: society.treasurer,
  };
}
