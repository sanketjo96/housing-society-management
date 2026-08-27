import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/infrastructure/prisma/client';
import { createUser } from '../../../src/features/users/admin/admin-users-service';
import { login } from '../../../src/features/auth/auth.service';
import { inferBankReferenceFromUpload } from '../../../src/features/society-ledger/society-ledger-ocr-service';
import { TINY_JPEG_BYTES, TINY_PDF_BYTES } from '../../fixtures/tiny-files';

describe('inferBankReferenceFromUpload (unit)', () => {
  it('returns bankReference: null for a non-image mime type, without attempting OCR', async () => {
    const result = await inferBankReferenceFromUpload(Buffer.from('%PDF-fake'), 'application/pdf');
    expect(result).toEqual({ bankReference: null });
  });
});

describe('POST /api/admin/society-ledger/ocr-extract', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Society Ledger OCR Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'society-ledger-ocr@okhdfcbank',
      },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Society Ledger OCR Admin',
      email: `society-ledger-ocr-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Society Ledger OCR Owner',
      email: `society-ledger-ocr-owner-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/ocr-extract')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/ocr-extract')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns bankReference: null, not an error, when the image has no readable text', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/ocr-extract')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', TINY_JPEG_BYTES, { filename: 'proof.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bankReference: null });
  }, 20000);

  it('returns bankReference: null for a PDF proof — never OCR-processed', async () => {
    const res = await request(app)
      .post('/api/admin/society-ledger/ocr-extract')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', TINY_PDF_BYTES, { filename: 'proof.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bankReference: null });
  });
});
