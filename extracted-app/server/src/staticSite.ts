import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves the exported web app (`npx expo export --platform web`) from `dir`.
 * Unknown paths without a file extension get index.html, so links like /join/PND482
 * open the app, which then routes to the right screen.
 */
export function createStaticSite(dir: string) {
  const root = resolve(dir);

  async function fileAt(pathname: string): Promise<string | null> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const full = resolve(root, `.${decoded}`);
    if (full !== root && !full.startsWith(root + sep)) return null; // outside the site folder
    try {
      return (await stat(full)).isFile() ? full : null;
    } catch {
      return null;
    }
  }

  return async function serve(pathname: string, res: ServerResponse): Promise<void> {
    let file = await fileAt(pathname);
    if (!file && !extname(pathname)) file = await fileAt('/index.html');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const body = await readFile(file);
    // Bundles and assets have content hashes in their names, so they can be cached for good.
    const hashed = pathname.startsWith('/_expo/') || pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  };
}
