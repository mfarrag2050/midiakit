/**
 * GET /v1/subscription/invoices (docs/16 §13.5). owner.
 * يرجع قائمة فواتير من المحوّد. مستأجر بلا اشتراك ⇒ [] بلا خطأ.
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireRoleIn } from '../../shared/role-guard.js';
import { getPaymentsProvider } from '../../payments/index.js';

interface SubRow { external_customer_id: string | null }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/invoices', { preHandler: fastify.authenticated }, async (req) => {
    requireRoleIn(req, ['owner']);

    const cur = await req.dbClient!.query<SubRow>(
      `SELECT external_customer_id FROM subscriptions LIMIT 1`);
    const customerId = cur.rows[0]?.external_customer_id;
    if (!customerId) return { invoices: [] };

    const invoices = await getPaymentsProvider().listInvoices(customerId);
    return {
      invoices: invoices.map((inv) => ({
        id: inv.id,
        amountCents: inv.amountCents,
        currency: inv.currency,
        status: inv.status,
        issuedAt: inv.issuedAt.toISOString(),
        pdfUrl: inv.pdfUrl,
      })),
    };
  });
};
export default route;
