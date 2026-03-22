import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/color_tokens.dart';
import '../theme/spacing.dart';

/// Desktop sidebar navigation items.
class NavItem {
  const NavItem({required this.icon, required this.label, required this.index});
  final IconData icon;
  final String label;
  final int index;
}

const _navItems = [
  NavItem(icon: Icons.dashboard_rounded, label: 'Projects', index: 0),
  NavItem(icon: Icons.dns_rounded, label: 'Servers', index: 1),
  NavItem(icon: Icons.settings_rounded, label: 'Settings', index: 2),
];

/// AppShell wraps the [StatefulShellRoute] navigation.
///
/// Desktop: collapsible sidebar (240px) + content area.
/// Mobile: bottom navigation bar.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDesktop = MediaQuery.sizeOf(context).width >=
        AppSpacing.mobileBreakpoint;

    if (isDesktop) {
      return _DesktopShell(navigationShell: navigationShell);
    }
    return _MobileShell(navigationShell: navigationShell);
  }
}

class _DesktopShell extends StatelessWidget {
  const _DesktopShell({required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Sidebar
          _Sidebar(
            selectedIndex: navigationShell.currentIndex,
            onItemSelected: (index) => navigationShell.goBranch(index),
          ),
          // Content
          Expanded(child: navigationShell),
        ],
      ),
    );
  }
}

class _MobileShell extends StatelessWidget {
  const _MobileShell({required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(index),
        destinations: _navItems
            .map((item) => NavigationDestination(
                  icon: Icon(item.icon),
                  label: item.label,
                ))
            .toList(),
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({required this.selectedIndex, required this.onItemSelected});
  final int selectedIndex;
  final ValueChanged<int> onItemSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: AppSpacing.sidebarWidth,
      color: AppColors.bgSurface,
      child: Column(
        children: [
          // Logo / header
          SizedBox(
            height: AppSpacing.topBarHeight,
            child: Center(
              child: Text(
                'Vibe Board',
                style: TextStyle(
                  color: AppColors.textHigh,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  fontFamily: 'IBM Plex Sans',
                ),
              ),
            ),
          ),
          const Divider(height: 1),
          // Nav items
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              child: Column(
                children: _navItems.map((item) {
                  final isSelected = item.index == selectedIndex;
                  return _SidebarItem(
                    item: item,
                    isSelected: isSelected,
                    onTap: () => onItemSelected(item.index),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({
    required this.item,
    required this.isSelected,
    required this.onTap,
  });

  final NavItem item;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xxs),
      child: Material(
        color: isSelected ? AppColors.brandMuted : Colors.transparent,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
          hoverColor: AppColors.hover,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.base,
            ),
            child: Row(
              children: [
                Icon(
                  item.icon,
                  size: AppSpacing.iconSize,
                  color: isSelected ? AppColors.brandText : AppColors.textLow,
                ),
                const SizedBox(width: AppSpacing.md),
                Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight:
                        isSelected ? FontWeight.w500 : FontWeight.w400,
                    color:
                        isSelected ? AppColors.textHigh : AppColors.textNormal,
                    fontFamily: 'IBM Plex Sans',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
