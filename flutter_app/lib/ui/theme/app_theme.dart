import 'package:flutter/material.dart';
import 'color_tokens.dart';
import 'spacing.dart';

/// Builds the dark-first [ThemeData] for the app.
ThemeData buildDarkTheme() {
  const colorScheme = ColorScheme.dark(
    primary: AppColors.brand,
    onPrimary: AppColors.textHigh,
    primaryContainer: AppColors.brandMuted,
    onPrimaryContainer: AppColors.brandText,
    secondary: AppColors.bgElevated,
    onSecondary: AppColors.textNormal,
    surface: AppColors.bgSurface,
    onSurface: AppColors.textHigh,
    surfaceContainerHighest: AppColors.bgPanel,
    error: AppColors.error,
    onError: AppColors.textHigh,
    outline: AppColors.border,
    outlineVariant: AppColors.borderStrong,
  );

  return ThemeData(
    brightness: Brightness.dark,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppColors.bgBase,

    // ── Typography ────────────────────────────────────────────────────
    fontFamily: 'IBM Plex Sans',

    // ── AppBar ────────────────────────────────────────────────────────
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.bgSurface,
      foregroundColor: AppColors.textHigh,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.textHigh,
        fontFamily: 'IBM Plex Sans',
      ),
    ),

    // ── Card ──────────────────────────────────────────────────────────
    cardTheme: CardThemeData(
      color: AppColors.bgPanel,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        side: const BorderSide(color: AppColors.border),
      ),
      margin: EdgeInsets.zero,
    ),

    // ── Input ─────────────────────────────────────────────────────────
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.bgSurface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        borderSide: const BorderSide(color: AppColors.error),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.base,
      ),
      hintStyle: const TextStyle(color: AppColors.textLow, fontSize: 13),
      errorStyle: const TextStyle(color: AppColors.error, fontSize: 12),
    ),

    // ── Buttons ───────────────────────────────────────────────────────
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.textHigh,
        elevation: 0,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.base,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        ),
        textStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    ),

    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        foregroundColor: AppColors.textHigh,
        elevation: 0,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.base,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        ),
        textStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    ),

    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textNormal,
        side: const BorderSide(color: AppColors.border),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.base,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
        ),
        textStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    ),

    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.brandText,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        textStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          fontFamily: 'IBM Plex Sans',
        ),
      ),
    ),

    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: AppColors.textLow,
        hoverColor: AppColors.hover,
        highlightColor: AppColors.active,
      ),
    ),

    // ── Menu / Popup ──────────────────────────────────────────────────
    popupMenuTheme: PopupMenuThemeData(
      color: AppColors.bgElevated,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusLg),
        side: const BorderSide(color: AppColors.border),
      ),
      textStyle: const TextStyle(
        color: AppColors.textNormal,
        fontSize: 13,
        fontFamily: 'IBM Plex Sans',
      ),
    ),

    // ── Dialog ────────────────────────────────────────────────────────
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.bgPanel,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusXl),
        side: const BorderSide(color: AppColors.border),
      ),
      titleTextStyle: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.textHigh,
        fontFamily: 'IBM Plex Sans',
      ),
      contentTextStyle: const TextStyle(
        fontSize: 13,
        color: AppColors.textNormal,
        fontFamily: 'IBM Plex Sans',
      ),
    ),

    // ── Divider ───────────────────────────────────────────────────────
    dividerTheme: const DividerThemeData(
      color: AppColors.divider,
      thickness: 1,
      space: 1,
    ),

    // ── Tooltip ───────────────────────────────────────────────────────
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: AppColors.bgOverlay,
        borderRadius: BorderRadius.circular(AppSpacing.borderRadiusSm),
        border: Border.all(color: AppColors.border),
      ),
      textStyle: const TextStyle(
        color: AppColors.textNormal,
        fontSize: 12,
        fontFamily: 'IBM Plex Sans',
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    ),

    // ── Scrollbar ─────────────────────────────────────────────────────
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStateProperty.all(AppColors.borderStrong),
      thickness: WidgetStateProperty.all(6),
      radius: const Radius.circular(3),
    ),

    // ── BottomSheet ───────────────────────────────────────────────────
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.bgPanel,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(16),
        ),
      ),
    ),

    // ── Drawer ────────────────────────────────────────────────────────
    drawerTheme: const DrawerThemeData(
      backgroundColor: AppColors.bgSurface,
      surfaceTintColor: Colors.transparent,
      width: AppSpacing.sidebarWidth,
    ),

    // ── ListTile ──────────────────────────────────────────────────────
    listTileTheme: const ListTileThemeData(
      textColor: AppColors.textNormal,
      iconColor: AppColors.textLow,
      contentPadding: EdgeInsets.symmetric(horizontal: 12),
      minTileHeight: 36,
    ),

    // ── TabBar ────────────────────────────────────────────────────────
    tabBarTheme: const TabBarThemeData(
      indicatorColor: AppColors.brand,
      labelColor: AppColors.textHigh,
      unselectedLabelColor: AppColors.textLow,
      dividerColor: AppColors.divider,
      indicatorSize: TabBarIndicatorSize.tab,
    ),

    // ── Floating action button ────────────────────────────────────────
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AppColors.brand,
      foregroundColor: AppColors.textHigh,
      elevation: 0,
      focusElevation: 0,
      hoverElevation: 0,
      highlightElevation: 0,
    ),

    // ── Switch ────────────────────────────────────────────────────────
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return AppColors.brand;
        }
        return AppColors.textLow;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return AppColors.brandMuted;
        }
        return AppColors.border;
      }),
    ),

    // ── Checkbox ──────────────────────────────────────────────────────
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return AppColors.brand;
        }
        return Colors.transparent;
      }),
      checkColor: WidgetStateProperty.all(AppColors.textHigh),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(3),
      ),
    ),

    // ── Chip ──────────────────────────────────────────────────────────
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.bgSurface,
      selectedColor: AppColors.brandMuted,
      labelStyle: const TextStyle(
        color: AppColors.textNormal,
        fontSize: 12,
        fontFamily: 'IBM Plex Sans',
      ),
      side: const BorderSide(color: AppColors.border),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    ),

    // ── Progress indicator ────────────────────────────────────────────
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.brand,
      linearTrackColor: AppColors.bgElevated,
      circularTrackColor: AppColors.bgElevated,
    ),

    // ── SnackBar ──────────────────────────────────────────────────────
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.bgElevated,
      contentTextStyle: const TextStyle(
        color: AppColors.textNormal,
        fontSize: 13,
        fontFamily: 'IBM Plex Sans',
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.borderRadius),
      ),
      behavior: SnackBarBehavior.floating,
      elevation: 0,
    ),
  );
}
