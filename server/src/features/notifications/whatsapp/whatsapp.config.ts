import { env, requiredEnv } from '../../../config/env';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

// Read at call time (same convention as env()/requiredEnv() themselves — see
// config/env.ts), not cached at module load, so tests can override individual values
// without needing to reset a module cache.
export function getWhatsAppConfig(): WhatsAppConfig {
  return {
    accessToken: requiredEnv('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: requiredEnv('WHATSAPP_PHONE_NUMBER_ID'),
    apiVersion: env('WHATSAPP_API_VERSION', 'v21.0')!,
  };
}
