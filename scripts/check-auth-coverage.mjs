#!/usr/bin/env node
/**
 * 221-AUTH-COVERAGE-GATE · فاحص تغطية الحراسة.
 *
 * يجرد المسارات عبر `fastify.mkCollectedRoutes` (تُجمَع بـonRoute hook في server.ts)
 * ويقارن مع `PUBLIC_ROUTES_SET` (public-routes.ts).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const { buildServer } = await import(join(ROOT, 'apps/api/src/server.ts'));
const { PUBLIC_ROUTES_SET } = await import(join(ROOT, 'apps/api/src/routes/public-routes.ts'));
const { closePool, closePlatformPool } = await import(join(ROOT, 'apps/api/src/db.ts'));
const { closeQueues } = await import(join(ROOT, 'apps/api/src/queues/index.ts'));

const fastify = await buildServer();
await fastify.ready();
const routes = fastify.mkCollectedRoutes;

// HEAD يُضاف تلقائيّاً لكل GET بنفس الحراسة · نطويهم. OPTIONS + * = CORS.
const filtered = routes.filter((r) =>
  r.method !== 'HEAD' && r.method !== 'OPTIONS' && r.path !== '*',
);

const errors = [];
const warnings = [];

for (const r of filtered) {
  const key = `${r.method} ${r.path}`;
  if (!r.hasPreHandler && !PUBLIC_ROUTES_SET.has(key)) {
    errors.push(
      `  ✗ ${key}: لا حارس preHandler · وليس في PUBLIC_ROUTES.\n` +
      `      الحلّ: أضِف preHandler: fastify.authenticated · أو أضِف entry في public-routes.ts.`
    );
  }
  if (r.hasPreHandler && PUBLIC_ROUTES_SET.has(key)) {
    warnings.push(
      `  ⚠ ${key}: له حارس · وأيضاً في PUBLIC_ROUTES (تناقض · قرار قديم؟).\n` +
      `      hooks: [${r.preHandlerNames.join(', ')}]`
    );
  }
}

const registeredKeys = new Set(filtered.map((r) => `${r.method} ${r.path}`));
for (const declared of PUBLIC_ROUTES_SET) {
  if (!registeredKeys.has(declared)) {
    errors.push(
      `  ✗ ${declared}: في PUBLIC_ROUTES لكن **غير مسجَّل في fastify**.\n` +
      `      الحلّ: احذف entry إن كان المسار قد أُلغي.`
    );
  }
}

await fastify.close();
await closeQueues();
await closePool();
await closePlatformPool();

if (errors.length > 0) {
  console.error(`[check-auth-coverage] ✗ ${errors.length} انحراف تغطية:`);
  for (const e of errors) console.error(e);
  if (warnings.length > 0) {
    console.error(`\n[check-auth-coverage] ⚠ ${warnings.length} تحذير:`);
    for (const w of warnings) console.error(w);
  }
  process.exit(1);
}

console.log(
  `[check-auth-coverage] ✓ ${filtered.length} مسار · ${PUBLIC_ROUTES_SET.size} عامّ مُعلَن · ${filtered.length - PUBLIC_ROUTES_SET.size} محميّ.`,
);
if (warnings.length > 0) {
  console.log(`\n[check-auth-coverage] ⚠ ${warnings.length} تحذير:`);
  for (const w of warnings) console.log(w);
}
