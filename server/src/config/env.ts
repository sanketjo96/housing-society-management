/** Read environment at call time so tests can safely override individual values. */
export function env(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} must be set`);
  return value;
}
