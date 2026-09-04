import { PageHeader } from '@/src/ui/PageHeader';
import { EmptyState } from '@/src/ui/EmptyState';

export default function AssetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.assets.title"
        subtitleKey="pages.assets.subtitle"
      />
      <EmptyState
        titleKey="pages.assets.empty"
        bodyKey="pages.assets.emptyBody"
      />
    </div>
  );
}
