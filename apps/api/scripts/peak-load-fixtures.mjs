import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { validateTemplate } from '@pf-mediakit/templates';

// Ticket 469 only: new, isolated tenants; no updates to existing dev fixtures.
export async function inTenant(db, tenantId, fn) {
  await db.query('BEGIN');
  try {
    await db.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function createPeakFixtures(db, s3, bucket, runId, emit) {
  const brandBase = JSON.parse(await readFile(new URL('../../../brands/client-demo.json', import.meta.url)));
  const template = validateTemplate(JSON.parse(await readFile(new URL('../../../packages/templates/src/templates/plain.json', import.meta.url))));
  const font = await readFile(new URL('../../../assets/fonts/Almarai-Regular.ttf', import.meta.url));
  const license = await readFile(new URL('../../../assets/fonts/OFL-Almarai.txt', import.meta.url), 'utf8');
  if (!license.includes('SIL OPEN FONT LICENSE')) throw new Error('PEAK_FONT_LICENSE_MISSING');
  const content = { headline: 'تطوير خدمات المدينة يفتح آفاقاً جديدة لتحسين الحياة اليومية للسكان', locale: 'ar' };
  const tenants = [];
  for (const label of ['A', 'B', 'C']) {
    const tenantId = randomUUID();
    const assetId = randomUUID();
    const fontKey = `${tenantId}/peak-${runId}/${assetId}.ttf`;
    const brand = structuredClone(brandBase);
    brand.id = `peak-${runId}-${label}`;
    brand.name = `اختبار الذروة ${label}`;
    brand.fonts.primary.assetId = assetId;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: fontKey, Body: font, ContentType: 'font/ttf' }));
    const tenant = await inTenant(db, tenantId, async client => {
      await client.query('INSERT INTO tenants(id,name) VALUES($1,$2)', [tenantId, `peak-469-${runId}-${label}`]);
      await client.query(`INSERT INTO assets(id,tenant_id,kind,storage_key,license_ack,finalized_at,filename,size_bytes,content_type,metadata)
        VALUES($1,$2,'font',$3,true,NOW(),'Almarai-Regular.ttf',$4,'font/ttf',$5::jsonb)`,
      [assetId, tenantId, fontKey, font.length, JSON.stringify({ license: 'SIL OFL 1.1', licenseText: license, ticket: '469' })]);
      const bk = await client.query('INSERT INTO brand_kits(tenant_id,name,config) VALUES($1,$2,$3::jsonb) RETURNING id',
        [tenantId, brand.name, JSON.stringify(brand)]);
      const tpl = await client.query(`INSERT INTO templates(tenant_id,scope,kind,name,definition)
        VALUES($1,'tenant','static',$2,$3::jsonb) RETURNING id`, [tenantId, `peak-469-${label}`, JSON.stringify(template)]);
      const project = await client.query(`INSERT INTO projects(tenant_id,brand_kit_id,template_id,name,content)
        VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id`,
      [tenantId, bk.rows[0].id, tpl.rows[0].id, `peak-469-${label}`, JSON.stringify(content)]);
      return { label, tenantId, projectId: project.rows[0].id, brandSnapshot: brand, templateSnapshot: template, content };
    });
    tenants.push(tenant);
    emit('fixture', { label, tenantId, projectId: tenant.projectId, assetId, fontKey, license: 'SIL OFL 1.1' });
  }
  const definitions = [
    ['normal', 0], ['normal', 0], ['normal', 1], ['normal', 1], ['normal', 2], ['normal', 2],
    ['edit', 2], ['urgent', 0], ['urgent', 1],
  ];
  const jobs = [];
  for (const [queue, tenantIndex] of definitions) {
    const { label, ...tenant } = tenants[tenantIndex];
    const renderId = randomUUID();
    const payload = { ...tenant, renderId, size: 'x', format: 'png' };
    const row = await inTenant(db, tenant.tenantId, client => client.query(`INSERT INTO renders
      (id,tenant_id,project_id,size,format,status,brand_snapshot,template_snapshot,idempotency_key)
      VALUES($1,$2,$3,$4,$5,'queued',$6::jsonb,$7::jsonb,$8) RETURNING created_at`,
    [renderId, tenant.tenantId, tenant.projectId, payload.size, payload.format,
      JSON.stringify(tenant.brandSnapshot), JSON.stringify(tenant.templateSnapshot), `peak-469-${runId}-${jobs.length}`]));
    jobs.push({ label, queue, payload, dbCreatedAt: row.rows[0].created_at });
  }
  return jobs;
}
