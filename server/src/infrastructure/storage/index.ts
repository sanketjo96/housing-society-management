import { LocalStorageAdapter } from './local-storage-adapter';
import type { StorageAdapter } from './types';
import { env } from '../../config/env';

export type { SaveFileInput, StorageAdapter } from './types';

// Task 6.2/6.3's provider switch: one env var picks the implementation; nothing else
// in the codebase imports a concrete adapter class directly (every service/controller
// goes through this factory). 'local' is the only implemented provider — this MVP's
// actual deployment target is a single self-hosted VPS (CLAUDE.md's non-functional
// requirements) — but 's3' and 'gdrive' are named here as the deliberate extension
// points a later phase would fill in: implement StorageAdapter (./types.ts) and add a
// case below, no other file in the codebase needs to change.
export function getStorageAdapter(): StorageAdapter {
  const provider = env('STORAGE_PROVIDER', 'local');
  switch (provider) {
    case 'local':
      return new LocalStorageAdapter(env('LOCAL_STORAGE_DIR', './uploads')!);
    case 's3':
    case 'gdrive':
      throw new Error(
        `STORAGE_PROVIDER=${provider} is a recognized extension point but has no adapter ` +
          'implemented yet — implement StorageAdapter (src/infrastructure/storage/types.ts) and add a case here.',
      );
    default:
      throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
  }
}
