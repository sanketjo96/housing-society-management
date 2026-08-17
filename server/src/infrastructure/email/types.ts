export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Task 6.2/6.3's StorageAdapter (src/infrastructure/storage/types.ts) already established this
// "one interface, pluggable implementation" shape — CLAUDE.md's tech-stack table
// promised the same for email ("Resend or SendGrid, behind a swappable EmailProvider
// interface"), this is that. Every caller sends both html and text (not one or the
// other) so a provider never has to synthesize a plaintext fallback itself.
export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>;
}
