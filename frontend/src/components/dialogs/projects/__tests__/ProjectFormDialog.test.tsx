import React, { useState } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real bug: the app mounts multiple <NiceModal.Provider> instances that all
// share ONE modal store (one per connection tab). When a modal is shown, every
// provider renders the same modal component concurrently, so a modal that
// auto-runs a side effect (creating a project) runs that effect once PER mounted
// provider — producing duplicate same-name projects.
//
// We reproduce that by mounting the dialog component multiple times in parallel,
// all reporting modal.visible === true, and asserting the create runs once.

const modalBacking = {
  visible: true,
  resolve: vi.fn(),
  hide: vi.fn(() => {
    modalBacking.visible = false;
  }),
  show: vi.fn(),
  remove: vi.fn(),
};

vi.mock('@ebay/nice-modal-react', () => ({
  default: {
    create: (Comp: React.ComponentType<unknown>) => Comp,
  },
  // fresh object every call → unstable identity, like the real hook
  useModal: () => ({ ...modalBacking }),
}));

const pickedRepo = {
  path: '/tmp/my-repo',
  name: 'my-repo',
  display_name: 'my-repo',
};
const repoPickerShow = vi.fn(async () => pickedRepo);
vi.mock('@/components/dialogs/shared/RepoPickerDialog', () => ({
  RepoPickerDialog: { show: (...args: unknown[]) => repoPickerShow(...args) },
}));

const createMutate = vi.fn();
const mutationState = {
  isPending: false,
  isError: false,
  error: null as Error | null,
};
vi.mock('@/hooks/useProjectMutations', () => ({
  useProjectMutations: () => ({
    createProject: { mutate: createMutate, ...mutationState },
  }),
}));

import { ProjectFormDialog } from '../ProjectFormDialog';

const InnerImpl = ProjectFormDialog as unknown as React.ComponentType<
  Record<string, never>
>;

// Render N copies of the dialog in parallel — mimics N tab providers sharing the
// same modal store, each rendering the same modal component instance.
function MultiProvider({ count }: { count: number }) {
  const [, setTick] = useState(0);
  (MultiProvider as unknown as { rerender: () => void }).rerender = () =>
    setTick((t) => t + 1);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <InnerImpl key={i} />
      ))}
    </>
  );
}

beforeEach(() => {
  modalBacking.visible = true;
  modalBacking.resolve = vi.fn();
  modalBacking.hide = vi.fn(() => {
    modalBacking.visible = false;
  });
  createMutate.mockReset();
  repoPickerShow.mockClear();
});

describe('ProjectFormDialog create-from-repo', () => {
  it('creates the project once even when rendered in multiple modal providers', async () => {
    render(<MultiProvider count={3} />);

    await waitFor(() => expect(repoPickerShow).toHaveBeenCalled());
    await waitFor(() => expect(createMutate).toHaveBeenCalled());

    // give any straggler effects a chance to (incorrectly) fire
    for (let i = 0; i < 3; i++) {
      act(() => {
        (MultiProvider as unknown as { rerender: () => void }).rerender();
      });
    }

    // Exactly one repo pick and one create across all three providers.
    expect(repoPickerShow).toHaveBeenCalledTimes(1);
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it('allows creating again after the dialog closes and reopens', async () => {
    const { unmount } = render(<MultiProvider count={2} />);
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));

    // Close the dialog: unmounting releases the cross-instance claim.
    unmount();

    // Reopen for a second project creation.
    render(<MultiProvider count={2} />);
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(2));
    expect(repoPickerShow).toHaveBeenCalledTimes(2);
  });
});
