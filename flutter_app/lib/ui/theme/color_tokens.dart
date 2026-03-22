import 'package:flutter/material.dart';

/// Linear-inspired dark color system with purple brand accent.
class AppColors {
  AppColors._();

  // ── Background layers (darkest → lightest) ──────────────────────────
  static const Color bgBase = Color(0xFF0A0A0B);
  static const Color bgSurface = Color(0xFF131316);
  static const Color bgPanel = Color(0xFF1A1A1F);
  static const Color bgElevated = Color(0xFF1E1E24);
  static const Color bgOverlay = Color(0xFF252530);

  // ── Text colors ─────────────────────────────────────────────────────
  static const Color textHigh = Color(0xFFE8E8ED);
  static const Color textNormal = Color(0xFFB4B4C4);
  static const Color textLow = Color(0xFF5C5C6F);

  // ── Brand (purple) ──────────────────────────────────────────────────
  static const Color brand = Color(0xFF7C5CFC);
  static const Color brandHover = Color(0xFF8B6FFF);
  static const Color brandMuted = Color(0x337C5CFC); // 20% opacity
  static const Color brandText = Color(0xFFA98BFF);

  // ── Status colors ───────────────────────────────────────────────────
  static const Color statusTodo = Color(0xFF8B8B9E);
  static const Color statusInProgress = Color(0xFF5B8DEF);
  static const Color statusInReview = Color(0xFF7C5CFC);
  static const Color statusDone = Color(0xFF3ECF8E);
  static const Color statusCancelled = Color(0xFFE55565);

  // ── Semantic colors ─────────────────────────────────────────────────
  static const Color error = Color(0xFFE55565);
  static const Color errorMuted = Color(0x33E55565);
  static const Color success = Color(0xFF3ECF8E);
  static const Color successMuted = Color(0x333ECF8E);
  static const Color warning = Color(0xFFF5A623);
  static const Color warningMuted = Color(0x33F5A623);

  // ── Borders & dividers ──────────────────────────────────────────────
  static const Color border = Color(0xFF252530);
  static const Color borderStrong = Color(0xFF353545);
  static const Color divider = Color(0xFF1E1E24);

  // ── Interactive states ──────────────────────────────────────────────
  static const Color hover = Color(0x0DFFFFFF); // 5% white
  static const Color active = Color(0x1AFFFFFF); // 10% white
  static const Color focus = Color(0x337C5CFC); // 20% brand

  /// Returns the status color for a given task status string.
  static Color statusColor(String status) {
    switch (status) {
      case 'todo':
        return statusTodo;
      case 'inprogress':
        return statusInProgress;
      case 'inreview':
        return statusInReview;
      case 'done':
        return statusDone;
      case 'cancelled':
        return statusCancelled;
      default:
        return statusTodo;
    }
  }
}
