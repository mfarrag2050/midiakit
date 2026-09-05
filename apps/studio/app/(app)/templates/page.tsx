import { PageHeader } from '@pf-mediakit/ui';
import { EmptyState } from '@pf-mediakit/ui';

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
