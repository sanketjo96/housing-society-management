// Translates Prisma's P2002 (unique constraint violation) into the field name(s)
// that collided. Prisma 7 + @prisma/adapter-pg nests the field list at
// `err.meta.driverAdapterError.cause.constraint.fields`, not the documented
// `err.meta.target` — checked first, falls back to the classic shape.
export function getUniqueConstraintFields(err: unknown): string[] | null {
  if (!isPrismaKnownRequestError(err) || err.code !== 'P2002') return null;

  const meta = err.meta as
    | {
        target?: string[] | string;
        driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
      }
    | undefined;

  const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
  if (adapterFields && adapterFields.length > 0) return adapterFields;

  if (Array.isArray(meta?.target)) return meta.target;
  if (typeof meta?.target === 'string') return [meta.target];

  return null;
}

function isPrismaKnownRequestError(err: unknown): err is { code: string; meta?: unknown } {
  return typeof err === 'object' && err !== null && 'code' in err;
}
