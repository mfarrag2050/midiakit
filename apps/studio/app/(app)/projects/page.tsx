import { PageHeader } from '@/src/ui/PageHeader';
import { EmptyState } from '@/src/ui/EmptyState';

// شاشة المشاريع — تُملأ في S12 بعد A14. حتى ذلك، صفحة فارغة موصوفة.
export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titleKey="pages.projects.title"
        subtitleKey="pages.projects.subtitle"
      />
      <EmptyState titleKey="pages.projects.empty" bodyKey="pages.projects.emptyBody" />
    </div>
  );
}
