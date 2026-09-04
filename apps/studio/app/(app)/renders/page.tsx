import { PageHeader } from '@/src/ui/PageHeader';
import { EmptyState } from '@/src/ui/EmptyState';

export default function RendersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.renders.title"
        subtitleKey="pages.renders.subtitle"
      />
      <EmptyState
        titleKey="pages.renders.empty"
        bodyKey="pages.renders.emptyBody"
      />
    </div>
  );
}
