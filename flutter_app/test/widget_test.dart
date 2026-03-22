import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vibe_board/app.dart';

void main() {
  testWidgets('App renders without errors', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: App()));
    expect(find.text('Projects'), findsWidgets);
  });
}
