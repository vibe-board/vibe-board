#!/bin/bash

set -e  # Exit on any error

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case "$ARCH" in
  x86_64)
    ARCH="x64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "⚠️  Warning: Unknown architecture $ARCH, using as-is"
    ;;
esac

# Map OS names
case "$OS" in
  linux)
    OS="linux"
    ;;
  darwin)
    OS="macos"
    ;;
  *)
    echo "⚠️  Warning: Unknown OS $OS, using as-is"
    ;;
esac

PLATFORM="${OS}-${ARCH}"

# Set CARGO_TARGET_DIR if not defined
if [ -z "$CARGO_TARGET_DIR" ]; then
  CARGO_TARGET_DIR="target"
fi

echo "🔍 Detected platform: $PLATFORM"
echo "🔧 Using target directory: $CARGO_TARGET_DIR"

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p npx-cli/dist/$PLATFORM

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path Cargo.toml
cargo build --release --bin e2ee-gateway --manifest-path Cargo.toml

echo "📦 Creating distribution package..."

# Copy the main binary
cp ${CARGO_TARGET_DIR}/release/server vibe-board
zip -q vibe-board.zip vibe-board
rm -f vibe-board
mv vibe-board.zip npx-cli/dist/$PLATFORM/vibe-board.zip

# Copy the MCP binary
cp ${CARGO_TARGET_DIR}/release/mcp_task_server vibe-board-mcp
zip -q vibe-board-mcp.zip vibe-board-mcp
rm -f vibe-board-mcp
mv vibe-board-mcp.zip npx-cli/dist/$PLATFORM/vibe-board-mcp.zip

# Copy the Review CLI binary
cp ${CARGO_TARGET_DIR}/release/review vibe-board-review
zip -q vibe-board-review.zip vibe-board-review
rm -f vibe-board-review
mv vibe-board-review.zip npx-cli/dist/$PLATFORM/vibe-board-review.zip

# Copy the Gateway binary
cp ${CARGO_TARGET_DIR}/release/e2ee-gateway vibe-board-gateway
zip -q vibe-board-gateway.zip vibe-board-gateway
rm -f vibe-board-gateway
mv vibe-board-gateway.zip npx-cli/dist/$PLATFORM/vibe-board-gateway.zip

echo "✅ Build complete!"
echo "📁 Files created:"
echo "   - npx-cli/dist/$PLATFORM/vibe-board.zip"
echo "   - npx-cli/dist/$PLATFORM/vibe-board-mcp.zip"
echo "   - npx-cli/dist/$PLATFORM/vibe-board-review.zip"
echo "   - npx-cli/dist/$PLATFORM/vibe-board-gateway.zip"
echo ""
echo "🚀 To test locally, run:"
echo "   cd npx-cli && node bin/cli.js"
