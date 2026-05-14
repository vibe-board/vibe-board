import { createContext, useContext, type ReactNode } from 'react';
import type { Project } from 'shared/types';

export interface ProjectsNavigationOverrides {
  openProject?: (project: Project) => void;
  navigateToProjects?: () => void;
}

const ProjectsNavigationContext = createContext<ProjectsNavigationOverrides>(
  {}
);

export function ProjectsNavigationProvider({
  value,
  children,
}: {
  value: ProjectsNavigationOverrides;
  children: ReactNode;
}) {
  return (
    <ProjectsNavigationContext.Provider value={value}>
      {children}
    </ProjectsNavigationContext.Provider>
  );
}

export function useProjectsNavigation(): ProjectsNavigationOverrides {
  return useContext(ProjectsNavigationContext);
}
