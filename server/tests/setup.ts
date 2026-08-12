import 'dotenv/config';

// Payment-proof tests (Task 6.2/6.3) write real files through LocalStorageAdapter —
// keep them out of the dev-server's ./uploads dir entirely, in their own directory
// (gitignored, see .gitignore) so a test run never mixes files with real usage.
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_STORAGE_DIR = './test-uploads';

// Auth-endpoint rate limiting (src/middleware/auth-rate-limit.ts, Phase 9
// security audit) would otherwise trip from ordinary cross-file test traffic —
// many test files each call POST /api/auth/login a few times in their own
// beforeAll. The limiter's actual 429 behavior is verified against an isolated
// instance in tests/middleware/auth-rate-limit.test.ts instead, which doesn't
// honor this flag.
process.env.DISABLE_RATE_LIMIT = 'true';
