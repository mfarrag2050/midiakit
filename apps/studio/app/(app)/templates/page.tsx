import { PageHeader } from '@/src/ui/PageHeader';
import { EmptyState } from '@/src/ui/EmptyState';

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.templates.title"
        subtitleKey="pages.templates.subtitle"
      />
      <EmptyState
        titleKey="pages.templates.empty"
        bodyKey="pages.templates.emptyBody"
      />
    </div>
  );
}
