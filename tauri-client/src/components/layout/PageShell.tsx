import { Outlet } from 'react-router-dom';
import NavigationBar from './NavigationBar';
import BottomTabBar from './BottomTabBar';
import { OfflineBanner } from '@/components/connection/OfflineBanner';

export default function PageShell() {
  return (
    <div className="flex h-screen flex-col">
      <OfflineBanner />
      <NavigationBar />
      <main className="flex-1 overflow-auto" style={{ paddingTop: 'calc(3.5rem + var(--sat))', paddingBottom: 'calc(4rem + var(--sab))' }}>
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
