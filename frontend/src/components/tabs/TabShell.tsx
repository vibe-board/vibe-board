import { isLocalDirect } from '@/lib/isLocalDirect';
import { LocalDirectShell } from './LocalDirectShell';
import { MultiConnectionShell } from './MultiConnectionShell';

export function TabShell() {
  if (isLocalDirect) {
    return <LocalDirectShell />;
  }
  return <MultiConnectionShell />;
}
