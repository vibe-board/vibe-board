import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Typography system using IBM Plex Sans (body) and IBM Plex Mono (code).
///
/// Font sizes are intentionally smaller than typical Material defaults
/// to match the dense, Linear-style aesthetic.
class AppTextStyles {
  AppTextStyles._();

  static TextStyle get _base => GoogleFonts.ibmPlexSans(
        color: const Color(0xFFE8E8ED),
        height: 1.4,
      );

  static TextStyle get _mono => GoogleFonts.ibmPlexMono(
        color: const Color(0xFFE8E8ED),
        height: 1.5,
      );

  // ── Display ─────────────────────────────────────────────────────────
  static TextStyle get displayLarge => _base.copyWith(
        fontSize: 28,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get displayMedium => _base.copyWith(
        fontSize: 24,
        fontWeight: FontWeight.w700,
      );

  // ── Headings ────────────────────────────────────────────────────────
  static TextStyle get headingLarge => _base.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get headingMedium => _base.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get headingSmall => _base.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
      );

  // ── Body ────────────────────────────────────────────────────────────
  static TextStyle get bodyLarge => _base.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get bodyMedium => _base.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get bodySmall => _base.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w400,
      );

  // ── Caption / Label ─────────────────────────────────────────────────
  static TextStyle get caption => _base.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w400,
        color: const Color(0xFF8B8B9E),
      );

  static TextStyle get labelLarge => _base.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w500,
      );

  static TextStyle get labelMedium => _base.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w500,
      );

  static TextStyle get labelSmall => _base.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w500,
      );

  // ── Monospace / Code ────────────────────────────────────────────────
  static TextStyle get codeLarge => _mono.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get codeMedium => _mono.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get codeSmall => _mono.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w400,
      );

  // ── Utility ─────────────────────────────────────────────────────────
  /// Text with brand color.
  static TextStyle get brandText => bodyMedium.copyWith(
        color: const Color(0xFFA98BFF),
      );

  /// Text with error color.
  static TextStyle get errorText => bodyMedium.copyWith(
        color: const Color(0xFFE55565),
      );

  /// Low-emphasis text (placeholders, secondary info).
  static TextStyle get lowEmphasis => bodyMedium.copyWith(
        color: const Color(0xFF5C5C6F),
      );
}
