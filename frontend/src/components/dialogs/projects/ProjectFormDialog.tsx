import { useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { CreateProject, Project } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal } from '@/lib/modals';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';

export interface ProjectFormDialogProps {}

export type ProjectFormDialogResult =
  | { status: 'saved'; project: Project }
  | { status: 'canceled' };

// The app mounts one <NiceModal.Provider> per connection tab, all sharing a
// single modal store. When this modal is shown, every provider renders its own
// copy of the component concurrently, so the create effect below would run once
// per mounted provider and create duplicate same-name projects. This
// module-level flag ensures exactly one mounted instance drives the create flow.
let createFlowClaimed = false;

const ProjectFormDialogImpl = NiceModal.create<ProjectFormDialogProps>(() => {
  const modal = useModal();

  const { createProject } = useProjectMutations({
    onCreateSuccess: (project) => {
      modal.resolve({ status: 'saved', project } as ProjectFormDialogResult);
      modal.hide();
    },
    onCreateError: () => {},
  });
  const createProjectMutate = createProject.mutate;

  const hasStartedCreateRef = useRef(false);
  const didClaimRef = useRef(false);

  const handlePickRepo = useCallback(async () => {
    const repo = await RepoPickerDialog.show({
      title: 'Create Project',
      description: 'Select or create a repository for your project',
    });

    if (repo) {
      const projectName = repo.display_name || repo.name;

      const createData: CreateProject = {
        name: projectName,
        repositories: [{ display_name: projectName, git_repo_path: repo.path }],
      };

      createProjectMutate(createData);
    } else {
      modal.resolve({ status: 'canceled' } as ProjectFormDialogResult);
      modal.hide();
    }
  }, [createProjectMutate, modal]);

  // Keep the latest handler in a ref so the launch effect can run exactly once
  // on mount without re-running when handlePickRepo's identity changes (it does
  // every render because useModal() returns a new object each time).
  const handlePickRepoRef = useRef(handlePickRepo);
  handlePickRepoRef.current = handlePickRepo;

  useEffect(() => {
    if (hasStartedCreateRef.current) return;
    // Only the first mounted instance (across all shared-store providers) runs
    // the create flow; the rest bail out so the project is created once.
    if (createFlowClaimed) return;
    createFlowClaimed = true;
    didClaimRef.current = true;
    hasStartedCreateRef.current = true;
    handlePickRepoRef.current();

    // Release the claim when the claiming instance unmounts so a future open of
    // the dialog can claim it again.
    return () => {
      if (didClaimRef.current) {
        createFlowClaimed = false;
      }
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      modal.resolve({ status: 'canceled' } as ProjectFormDialogResult);
      modal.hide();
    }
  };

  return (
    <Dialog
      open={modal.visible && createProject.isPending}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Creating Project</DialogTitle>
          <DialogDescription>Setting up your project...</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>

        {createProject.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {createProject.error instanceof Error
                ? createProject.error.message
                : 'Failed to create project'}
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
});

export const ProjectFormDialog = defineModal<
  ProjectFormDialogProps,
  ProjectFormDialogResult
>(ProjectFormDialogImpl);
