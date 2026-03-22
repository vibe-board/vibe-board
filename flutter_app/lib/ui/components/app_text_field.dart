import 'package:flutter/material.dart';
import '../theme/color_tokens.dart';
import '../theme/spacing.dart';

/// Linear-style dark text field.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.hintText,
    this.autofocus = false,
    this.onSubmitted,
    this.onChanged,
    this.maxLines = 1,
    this.minLines,
    this.keyboardType,
    this.obscureText = false,
    this.enabled = true,
    this.suffix,
  });

  final TextEditingController? controller;
  final String? hintText;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final int maxLines;
  final int? minLines;
  final TextInputType? keyboardType;
  final bool obscureText;
  final bool enabled;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      onSubmitted: onSubmitted,
      onChanged: onChanged,
      maxLines: maxLines,
      minLines: minLines,
      keyboardType: keyboardType,
      obscureText: obscureText,
      enabled: enabled,
      style: const TextStyle(
        color: AppColors.textHigh,
        fontSize: 13,
        fontFamily: 'IBM Plex Sans',
      ),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: const TextStyle(
          color: AppColors.textLow,
          fontSize: 13,
          fontFamily: 'IBM Plex Sans',
        ),
        suffixIcon: suffix,
        filled: true,
        fillColor: AppColors.bgElevated,
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
          borderSide: const BorderSide(color: AppColors.brand),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        isDense: true,
      ),
    );
  }
}
