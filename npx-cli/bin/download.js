const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Replaced during npm pack by workflow
const GITHUB_RELEASES_REPO = "__GITHUB_RELEASES_REPO__"; // e.g. owner/repo
const BINARY_TAG = "__BINARY_TAG__"; // e.g., v0.0.135-20251215122030
const CACHE_DIR = path.join(require("os").homedir(), ".vibe-kanban", "bin");

// Local development mode: use binaries from npx-cli/dist/ instead of GitHub Release
// Only activate if dist/ exists (i.e., running from source after local-build.sh)
const LOCAL_DIST_DIR = path.join(__dirname, "..", "dist");
const LOCAL_DEV_MODE = fs.existsSync(LOCAL_DIST_DIR) || process.env.VIBE_KANBAN_LOCAL === "1";

async function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOpts = options.headers ? { headers: options.headers } : {};
    https.get(url, reqOpts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location, options).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    }).on("error", reject);
  });
}

async function downloadFile(url, destPath, expectedSha256, onProgress) {
  const tempPath = destPath + ".tmp";
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    const hash = crypto.createHash("sha256");

    const cleanup = () => {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    };

    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        cleanup();
        return downloadFile(res.headers.location, destPath, expectedSha256, onProgress)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        file.close();
        cleanup();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }

      const totalSize = parseInt(res.headers["content-length"], 10);
      let downloadedSize = 0;

      res.on("data", (chunk) => {
        downloadedSize += chunk.length;
        hash.update(chunk);
        if (onProgress) onProgress(downloadedSize, totalSize);
      });
      res.pipe(file);

      file.on("finish", () => {
        file.close();
        const actualSha256 = hash.digest("hex");
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          cleanup();
          reject(new Error(`Checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`));
        } else {
          try {
            fs.renameSync(tempPath, destPath);
            resolve(destPath);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
      });
    }).on("error", (err) => {
      file.close();
      cleanup();
      reject(err);
    });
  });
}

async function ensureBinary(platform, binaryName, onProgress) {
  // In local dev mode, use binaries directly from npx-cli/dist/
  if (LOCAL_DEV_MODE) {
    const localZipPath = path.join(LOCAL_DIST_DIR, platform, `${binaryName}.zip`);
    if (fs.existsSync(localZipPath)) {
      return localZipPath;
    }
    throw new Error(
      `Local binary not found: ${localZipPath}\n` +
      `Run ./local-build.sh first to build the binaries.`
    );
  }

  const cacheDir = path.join(CACHE_DIR, BINARY_TAG, platform);
  const zipPath = path.join(cacheDir, `${binaryName}.zip`);

  if (fs.existsSync(zipPath)) return zipPath;

  fs.mkdirSync(cacheDir, { recursive: true });

  const manifestUrl = `https://github.com/${GITHUB_RELEASES_REPO}/releases/download/${BINARY_TAG}/binaries-manifest.json`;
  const manifest = await fetchJson(manifestUrl);
  const binaryInfo = manifest.platforms?.[platform]?.[binaryName];

  if (!binaryInfo) {
    throw new Error(`Binary ${binaryName} not available for ${platform}`);
  }

  const assetName = `${binaryName}-${platform}.zip`;
  const url = `https://github.com/${GITHUB_RELEASES_REPO}/releases/download/${BINARY_TAG}/${assetName}`;
  await downloadFile(url, zipPath, binaryInfo.sha256, onProgress);

  return zipPath;
}

async function getLatestVersion() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_RELEASES_REPO}/releases?per_page=1`;
  const releases = await fetchJson(apiUrl, {
    headers: { "User-Agent": "vibe-kanban-cli" },
  });
  if (!Array.isArray(releases) || releases.length === 0) return null;
  return releases[0].tag_name || null;
}

module.exports = {
  GITHUB_RELEASES_REPO,
  BINARY_TAG,
  CACHE_DIR,
  LOCAL_DEV_MODE,
  LOCAL_DIST_DIR,
  ensureBinary,
  getLatestVersion,
};
