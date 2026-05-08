// frontend/src/components/tabs/TabShell.tsx
import { isLocalDirect, isGateway } from '@/lib/appMode';
import { LocalDirectShell } from './LocalDirectShell';
import { GatewayShell } from './GatewayShell';
import { MultiConnectionShell } from './MultiConnectionShell';

export function TabShell() {
  if (isLocalDirect) return <LocalDirectShell />;
  if (isGateway) return <GatewayShell />;
  return <MultiConnectionShell />;
}
