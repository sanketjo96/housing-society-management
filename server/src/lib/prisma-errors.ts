// Shared helper for translating Prisma's P2002 (unique constraint violation) into the
// specific field name(s) that collided, for services to turn into a typed domain error.
//
// GOTCHA: the classic documented Prisma shape is `err.meta.target: string[]`. That's
// NOT what actually comes back with Prisma 7 + @prisma/adapter-pg — confirmed
// empirically (Task 2.1's refactor) by triggering a real duplicate-email insert and
// inspecting the thrown error. The real shape nests the field list much deeper:
// `err.meta.driverAdapterError.cause.constraint.fields`. This function checks that
// path first and falls back to the classic `target` shape in case a future Prisma
// version or a different driver adapter reverts to it.
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
