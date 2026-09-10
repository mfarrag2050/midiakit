/**
 * shared — تحويل صفّ plans إلى الشكل العام (A28).
 * الهوية (key · name_ar · name_en) محروسة بـcheck-plan-sync.
 * الحدود والسعر قابلة للتحرير — يعرضها بصياغة موحّدة.
 */
export interface DbPlanRow {
  key: string;
  name_ar: string;
  name_en: string;
  price_usd_cents: number;
  brand_kits_limit: number | null;
  seats_limit: number | null;
  videos_per_month_limit: number | null;
  requests_per_minute_limit: number;
  concurrent_renders_limit: number;
  created_at: Date;
  updated_at: Date;
}

export function toPublicPlan(row: DbPlanRow) {
  return {
    key: row.key,
    name: { ar: row.name_ar, en: row.name_en },
    priceUsdCents: row.price_usd_cents,
    limits: {
      brandKits: row.brand_kits_limit,
      seats: row.seats_limit,
      videosPerMonth: row.videos_per_month_limit,
      requestsPerMinute: row.requests_per_minute_limit,
      concurrentRenders: row.concurrent_renders_limit,
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
