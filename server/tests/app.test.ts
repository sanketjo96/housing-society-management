import { describe, expect, it } from 'vitest';
import { app } from '../src/app';

describe('app', () => {
  it('exports an Express instance', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });
});
