import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';

/**
 * Artifact storage for screenshots and other scan outputs.
 *
 * The default driver writes to a local directory that the API and worker share
 * (a bind-mounted volume in Docker, the same folder in local dev). The abstraction
 * leaves room for an S3/MinIO driver later without touching call sites.
 *
 * A *relative* ARTIFACTS_DIR must not be resolved against `process.cwd()`: npm
 * workspace scripts run the API from `apps/api` and the worker from
 * `apps/worker`, so `./artifacts` would silently resolve to two different
 * physical folders — the worker writes screenshots the API can never find.
 * Anchor relative paths to the repo root instead; an absolute path (Docker
 * sets `/artifacts`) is used as-is.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // packages/storage/dist/index.js -> repo root

export interface ArtifactStore {
  put(key: string, data: Buffer): Promise<void>;
  getStream(key: string): Readable;
  exists(key: string): boolean;
}

export class FilesystemStore implements ArtifactStore {
  private readonly root: string;

  constructor(root = process.env.ARTIFACTS_DIR ?? './artifacts') {
    this.root = isAbsolute(root) ? resolve(root) : resolve(REPO_ROOT, root);
  }

  private pathFor(key: string): string {
    // Prevent path traversal: the resolved path must stay under root.
    const target = normalize(join(this.root, key));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error(`Invalid artifact key: ${key}`);
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  getStream(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  exists(key: string): boolean {
    return existsSync(this.pathFor(key));
  }
}

let store: ArtifactStore | null = null;

export function getArtifactStore(): ArtifactStore {
  if (!store) store = new FilesystemStore();
  return store;
}

/** Storage key for a viewport screenshot. */
export const screenshotKey = (scanId: string, viewportLabel: string): string =>
  `${scanId}/${slug(viewportLabel)}.png`;

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
