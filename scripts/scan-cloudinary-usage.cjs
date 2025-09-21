#!/usr/bin/env node
/*
  Scans the repository for Cloudinary image URLs, finds usage locations,
  fetches file sizes via HEAD (with fallback to GET), and prints a sorted report.
*/

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

const ROOT = process.cwd();

const INCLUDE_DIRS = [
  '.',
  'public',
];

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cursor',
  '.cache',
  '.vscode',
  'scripts', // avoid scanning this script itself
]);

const CLOUDINARY_REGEX = /https?:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/[\w=,]*[^"'\s)]+/gi;

/**
 * Recursively collect files to scan.
 */
async function collectFiles(startDir) {
  const files = [];
  async function walk(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        await walk(entryPath);
      } else {
        // Skip binary-like files by extension
        const ext = path.extname(entry.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.pdf', '.zip'].includes(ext)) continue;
        files.push(entryPath);
      }
    }
  }
  await walk(startDir);
  return files;
}

/**
 * Find Cloudinary URLs in a file and return matches with line numbers.
 */
async function findUrlsInFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    const matches = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      CLOUDINARY_REGEX.lastIndex = 0;
      while ((m = CLOUDINARY_REGEX.exec(line)) !== null) {
        const url = m[0].replace(/[\)\]\},;]+$/, '');
        matches.push({ url, filePath, line: i + 1 });
      }
    }
    return matches;
  } catch (e) {
    return [];
  }
}

async function getContentLength(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    // Some CDNs don't return content-length on HEAD; fall back to GET but avoid downloading body
    let len = res.headers.get('content-length');
    if (!len) {
      // Try a ranged GET to fetch minimal bytes
      const resGet = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: controller.signal,
      });
      len = resGet.headers.get('content-length') || res.headers.get('x-file-size');
      // Consume minimal
      await resGet.arrayBuffer().catch(() => {});
    }
    clearTimeout(timeout);
    return len ? Number(len) : null;
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes == null) return 'unknown';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

(async () => {
  const filesToScan = new Set();
  for (const dir of INCLUDE_DIRS) {
    const abs = path.resolve(ROOT, dir);
    if (fs.existsSync(abs)) {
      const stats = await stat(abs);
      if (stats.isDirectory()) {
        const files = await collectFiles(abs);
        for (const f of files) filesToScan.add(f);
      } else if (stats.isFile()) {
        filesToScan.add(abs);
      }
    }
  }

  const allFiles = Array.from(filesToScan);
  const urlToUsages = new Map();

  // Scan files in parallel batches
  const concurrency = 16;
  async function mapWithLimit(items, mapper) {
    const results = new Array(items.length);
    let idx = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) break;
        results[i] = await mapper(items[i], i);
      }
    }));
    return results;
  }

  await mapWithLimit(allFiles, async (filePath) => {
    const matches = await findUrlsInFile(filePath);
    for (const m of matches) {
      const existing = urlToUsages.get(m.url) || [];
      existing.push({ filePath: path.relative(ROOT, m.filePath), line: m.line });
      urlToUsages.set(m.url, existing);
    }
  });

  // Fetch sizes
  const entries = Array.from(urlToUsages.entries()).map(([url, usages]) => ({ url, usages }));
  await mapWithLimit(entries, async (entry, i) => {
    entry.size = await getContentLength(entry.url);
  });

  // Sort by size desc, unknown at bottom
  entries.sort((a, b) => {
    if (a.size == null && b.size == null) return 0;
    if (a.size == null) return 1;
    if (b.size == null) return -1;
    return b.size - a.size;
  });

  // Output
  console.log('count,bytes,pretty_size,url,used_in');
  for (const e of entries) {
    const where = e.usages.map(u => `${u.filePath}:${u.line}`).join('|');
    console.log(`${e.usages.length},${e.size ?? ''},${formatBytes(e.size)},${e.url},${where}`);
  }
})();


