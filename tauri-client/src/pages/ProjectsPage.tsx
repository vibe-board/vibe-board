import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectList } from '@/components/projects/ProjectList';
import { CreateProjectForm } from '@/components/projects/CreateProjectForm';
import { BottomSheet } from '@/components/ui/BottomSheet';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="relative flex flex-col h-full">
      {/* Scrollable list */}
      <div className="flex-1 overflow-auto">
        <ProjectList />
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
        aria-label={t('projects.create')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Create bottom sheet */}
      <BottomSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('projects.create')}
      >
        <CreateProjectForm onClose={() => setShowCreate(false)} />
      </BottomSheet>
    </div>
  );
}
