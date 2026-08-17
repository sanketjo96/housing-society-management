import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsoleEmailProvider } from '../../../src/infrastructure/email/console-email-provider';

describe('ConsoleEmailProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the email instead of sending it over the network', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await new ConsoleEmailProvider().send({
      to: 'resident@example.com',
      subject: 'Reset your password',
      html: '<p>link</p>',
      text: 'link',
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('resident@example.com'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reset your password'));
  });
});
