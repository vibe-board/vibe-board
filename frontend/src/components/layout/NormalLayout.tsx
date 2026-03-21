import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout';
import { BottomTabBar } from '@/components/mobile/BottomTabBar';
import { OfflineIndicator } from '@/components/OfflineIndicator';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const isMobile = useIsMobileLayout();

  return (
    <>
      <div className="flex flex-col h-screen">
        <DevBanner />
        <OfflineIndicator />
        {!shouldHideNavbar && !isMobile && <Navbar />}
        <div className={`flex-1 overflow-auto ${isMobile ? 'pb-16' : ''}`}>
          <Outlet />
        </div>
        {isMobile && <BottomTabBar />}
      </div>
    </>
  );
}
