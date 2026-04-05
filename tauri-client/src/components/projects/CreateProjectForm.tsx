import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateProject } from '@/api/hooks/useProjects';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface CreateProjectFormProps {
  onClose: () => void;
}

export function CreateProjectForm({ onClose }: CreateProjectFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const createProject = useCreateProject();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createProject.mutate(
      { name: trimmed, repositories: [] },
      {
        onSuccess: () => {
          setName('');
          onClose();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t('projects.nameLabel')}
        placeholder={t('projects.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      {createProject.isError && (
        <p className="text-sm text-destructive">
          {createProject.error?.message ?? t('common.error')}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onClose}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!name.trim() || createProject.isPending}
        >
          {createProject.isPending ? t('common.loading') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}
