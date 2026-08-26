// The mechanism every service uses when querying data owned by a society, so no
// query can accidentally leak across societies.
export function scopedWhere<T extends Record<string, unknown>>(
  societyId: string,
  where: T = {} as T,
): T & { societyId: string } {
  return { ...where, societyId };
}
