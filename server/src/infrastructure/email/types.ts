export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Every caller sends both html and text so a provider never has to synthesize
// a plaintext fallback itself.
export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>;
}
