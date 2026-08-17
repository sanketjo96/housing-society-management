import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';
import { createUser } from '../../src/services/admin-users.service';
import { createFlat } from '../../src/services/flats.service';
import { generateMaintenanceRecords } from '../../src/services/maintenance-record.service';
import { login } from '../../src/services/auth.service';
import { TINY_PNG_BYTES } from '../fixtures/tiny-files';

describe('/api/admin/settings', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let societyId: string;
  let adminToken: string;
  let ownerToken: string;
  const createdUserIds: string[] = [];
  const createdFlatIds: string[] = [];

  beforeAll(async () => {
    const society = await prisma.society.create({
      data: {
        name: `Settings Route Society ${suffix}`,
        address: '1 Test St',
        upiVpa: 'settings-route@okhdfcbank',
        tenantRateFactor: 1.5,
        defaultBaseRate: 1500,
      },
    });
    societyId = society.id;

    const adminPassword = 'admin-password-123';
    const admin = await createUser({
      name: 'Settings Admin',
      email: `settings-admin-${suffix}@example.com`,
      password: adminPassword,
      role: 'ADMIN',
      societyId,
    });
    createdUserIds.push(admin.id);
    adminToken = (await login({ email: admin.email, password: adminPassword })).accessToken;

    const ownerPassword = 'owner-password-123';
    const owner = await createUser({
      name: 'Non-Admin Caller',
      email: `settings-caller-${suffix}@example.com`,
      password: ownerPassword,
      role: 'OWNER',
      societyId,
    });
    createdUserIds.push(owner.id);
    ownerToken = (await login({ email: owner.email, password: ownerPassword })).accessToken;
  });

  afterAll(async () => {
    await prisma.maintenanceRecord.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.occupancyChange.deleteMany({ where: { flatId: { in: createdFlatIds } } });
    await prisma.flat.deleteMany({ where: { id: { in: createdFlatIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    const allUserIds = await prisma.user
      .findMany({ where: { societyId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    await prisma.society.delete({ where: { id: societyId } });
    await prisma.$disconnect();
  });

  it('rejects a request with no access token (401)', async () => {
    const res = await request(app).get('/api/admin/settings');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin token (403)', async () => {
    const res = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns the current settings for an admin', async () => {
    const res = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: `Settings Route Society ${suffix}`,
      address: '1 Test St',
      constructionDate: null,
      formationDate: null,
      upiVpa: 'settings-route@okhdfcbank',
      bankAccountNumber: null,
      bankIfsc: null,
      tenantRateFactor: 1.5,
      defaultBaseRate: 1500,
      receiptNumberPrefix: 'RCPT',
      receiptSignatoryName: null,
      receiptSignatoryTitle: null,
      receiptFooterNote: null,
      hasChairmanSignature: false,
      hasSecretarySignature: false,
      hasTreasurerSignature: false,
      chairman: null,
      secretary: null,
      treasurer: null,
    });
  });

  it('rejects a non-positive tenantRateFactor with a 400', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantRateFactor: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects an empty society name with a 400', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty or malformed constructionDate/formationDate with a 400', async () => {
    const empty = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ constructionDate: '' });
    expect(empty.status).toBe(400);

    const malformed = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ formationDate: '12th Jan 1999' });
    expect(malformed.status).toBe(400);
  });

  it('updates constructionDate and formationDate, and omitting them on another PATCH leaves them untouched', async () => {
    const set = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ constructionDate: '1998-04-12', formationDate: '1999-01-20' });
    expect(set.status).toBe(200);
    expect(set.body.constructionDate).toBe('1998-04-12');
    expect(set.body.formationDate).toBe('1999-01-20');

    const unrelated = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantRateFactor: 1.6 });
    expect(unrelated.status).toBe(200);
    expect(unrelated.body.constructionDate).toBe('1998-04-12');
    expect(unrelated.body.formationDate).toBe('1999-01-20');
  });

  it('updates the society name and UPI ID', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed via API', upiVpa: 'renamed-via-api@upi' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed via API');
    expect(res.body.upiVpa).toBe('renamed-via-api@upi');
  });

  it('assigns a committee role from the owners list, and rejects a non-owner id', async () => {
    const assignRes = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ chairmanId: createdUserIds[1] }); // the OWNER created in beforeAll
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.chairman.id).toBe(createdUserIds[1]);

    // The admin user itself isn't an OWNER — the dropdown only ever offers owners.
    const rejectRes = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ secretaryId: createdUserIds[0] });
    expect(rejectRes.status).toBe(400);
  });

  it('rejects an empty chairmanId/secretaryId/treasurerId with a 400 — roles are required, not clearable', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ chairmanId: '' });
    expect(res.status).toBe(400);
  });

  it('updates settings, and generation immediately reflects the new values end to end', async () => {
    const updateRes = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tenantRateFactor: 2, defaultBaseRate: 1700 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.tenantRateFactor).toBe(2);
    expect(updateRes.body.defaultBaseRate).toBe(1700);

    // A flat onboarded without specifying baseRate still requires it explicitly at the
    // service layer (defaultBaseRate only prefills the admin UI's form) — pass the
    // now-updated defaultBaseRate through explicitly here, exactly as the UI would.
    const flat = await createFlat({
      societyId,
      wing: 'S',
      flatNumber: '101',
      baseRate: 1700,
      ownerName: 'Settings Flat Owner',
      ownerEmail: `settings-flat-owner-${suffix}@example.com`,
      occupancy: 'tenant',
      tenantName: 'Settings Flat Tenant',
      tenantEmail: `settings-flat-tenant-${suffix}@example.com`,
      effectiveFrom: new Date('2020-01-01'),
    });
    createdFlatIds.push(flat!.id);

    const period = '2026-07';
    await generateMaintenanceRecords(societyId, period);
    const record = await prisma.maintenanceRecord.findUniqueOrThrow({
      where: { flatId_period: { flatId: flat!.id, period } },
    });
    // 1700 base rate * the freshly-updated 2x tenant factor = 3400 — proves
    // generateMaintenanceRecords reads the live Society row, not a stale/cached value.
    expect(Number(record.amount)).toBe(3400);
  });

  it('rejects an invalid receiptNumberPrefix with a 400', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receiptNumberPrefix: 'has a space' });
    expect(res.status).toBe(400);
  });

  it('updates the receipt template fields', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        address: 'Updated Address',
        receiptNumberPrefix: 'SR',
        receiptSignatoryName: 'Ramesh Kulkarni',
        receiptSignatoryTitle: 'Treasurer',
        receiptFooterNote: 'Thank you.',
      });
    expect(res.status).toBe(200);
    expect(res.body.address).toBe('Updated Address');
    expect(res.body.receiptNumberPrefix).toBe('SR');
    expect(res.body.receiptSignatoryName).toBe('Ramesh Kulkarni');
    expect(res.body.receiptSignatoryTitle).toBe('Treasurer');
    expect(res.body.receiptFooterNote).toBe('Thank you.');
  });

  describe('committee signature endpoints', () => {
    it('rejects a non-admin token on upload (403)', async () => {
      const res = await request(app)
        .post('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.from('fake-png'), { filename: 'sig.png', contentType: 'image/png' });
      expect(res.status).toBe(403);
    });

    it('rejects an unsupported file type (e.g. PDF)', async () => {
      const res = await request(app)
        .post('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('%PDF-fake'), { filename: 'sig.pdf', contentType: 'application/pdf' });
      expect(res.status).toBe(400);
    });

    it('rejects an invalid :role param with a 400', async () => {
      const res = await request(app)
        .post('/api/admin/settings/committee/bogus/signature')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG_BYTES, { filename: 'sig.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid committee role/i);
    });

    it('returns 404 when no treasurer signature is set yet', async () => {
      const res = await request(app)
        .get('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('uploads a treasurer signature, then serves it back and reflects hasTreasurerSignature in settings', async () => {
      const uploadRes = await request(app)
        .post('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG_BYTES, { filename: 'sig.png', contentType: 'image/png' });
      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.hasTreasurerSignature).toBe(true);

      const viewRes = await request(app)
        .get('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(viewRes.status).toBe(200);
      expect(viewRes.headers['content-type']).toBe('image/png');

      const settingsRes = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(settingsRes.body.hasTreasurerSignature).toBe(true);
    });

    it('removes the treasurer signature and reverts hasTreasurerSignature to false', async () => {
      const removeRes = await request(app)
        .delete('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.hasTreasurerSignature).toBe(false);

      const viewRes = await request(app)
        .get('/api/admin/settings/committee/treasurer/signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(viewRes.status).toBe(404);
    });

    it('reaches distinct storage for chairman and secretary, independent of treasurer', async () => {
      const chairmanRes = await request(app)
        .post('/api/admin/settings/committee/chairman/signature')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG_BYTES, { filename: 'sig.png', contentType: 'image/png' });
      expect(chairmanRes.status).toBe(200);
      expect(chairmanRes.body.hasChairmanSignature).toBe(true);
      expect(chairmanRes.body.hasSecretarySignature).toBe(false);

      const secretaryRes = await request(app)
        .post('/api/admin/settings/committee/secretary/signature')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', TINY_PNG_BYTES, { filename: 'sig.png', contentType: 'image/png' });
      expect(secretaryRes.status).toBe(200);
      expect(secretaryRes.body.hasChairmanSignature).toBe(true);
      expect(secretaryRes.body.hasSecretarySignature).toBe(true);
      expect(secretaryRes.body.hasTreasurerSignature).toBe(false);

      const viewRes = await request(app)
        .get('/api/admin/settings/committee/chairman/signature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(viewRes.status).toBe(200);
    });
  });
});
