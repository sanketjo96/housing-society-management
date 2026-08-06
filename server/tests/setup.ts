import 'dotenv/config';

// Payment-proof tests (Task 6.2/6.3) write real files through LocalStorageAdapter —
// keep them out of the dev-server's ./uploads dir entirely, in their own directory
// (gitignored, see .gitignore) so a test run never mixes files with real usage.
process.env.STORAGE_PROVIDER = 'local';
process.env.LOCAL_STORAGE_DIR = './test-uploads';
