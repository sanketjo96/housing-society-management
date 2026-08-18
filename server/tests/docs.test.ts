import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';

describe('GET /api/docs', () => {
  it('serves the Swagger UI with no authentication required', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('swagger-ui');
  });
});
