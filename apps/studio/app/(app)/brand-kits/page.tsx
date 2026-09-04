import { PageHeader } from '@/src/ui/PageHeader';
import { EmptyState } from '@/src/ui/EmptyState';

export default function BrandKitsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.brandKits.title"
        subtitleKey="pages.brandKits.subtitle"
      />
      <EmptyState
        titleKey="pages.brandKits.empty"
        bodyKey="pages.brandKits.emptyBody"
      />
    </div>
  );
}
