import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from 'shared/types';
import {
  ProjectsNavigationProvider,
  useProjectsNavigation,
} from '../ProjectsNavigationContext';

const project = {
  id: 'project-1',
  name: 'Project One',
} as Project;

function Probe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useProjectsNavigation>) => void;
}) {
  const value = useProjectsNavigation();
  onValue(value);
  return null;
}

describe('ProjectsNavigationContext', () => {
  it('returns no overrides by default', () => {
    const onValue = vi.fn();

    render(<Probe onValue={onValue} />);

    expect(onValue).toHaveBeenCalledWith({});
  });

  it('exposes provider overrides', () => {
    const openProject = vi.fn();
    const navigateToProjects = vi.fn();
    const onValue = vi.fn();

    render(
      <ProjectsNavigationProvider value={{ openProject, navigateToProjects }}>
        <Probe onValue={onValue} />
      </ProjectsNavigationProvider>
    );

    const value = onValue.mock.calls[0][0];
    value.openProject(project);
    value.navigateToProjects();

    expect(openProject).toHaveBeenCalledWith(project);
    expect(navigateToProjects).toHaveBeenCalledTimes(1);
  });
});
