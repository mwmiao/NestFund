import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_DIR } from './db';

/**
 * Moves the whole receipts folder to `dest` and leaves a fresh empty one behind. A rename is instant and needs no extra
 * disk space (both folders live in the data volume); if the rename is not possible (different filesystems) it falls
 * back to copy-then-delete. Returns false when there was nothing to move. Never deletes a receipt before it is safe at `dest`.
 */
export function moveUploadsTo(dest: string, uploadsDir: string = UPLOADS_DIR): boolean {
  const hasFiles = fs.existsSync(uploadsDir) && fs.readdirSync(uploadsDir).length > 0;
  if (!hasFiles) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return false;
  }
  if (fs.existsSync(dest)) throw new Error('uploads destination already exists');
  try {
    fs.renameSync(uploadsDir, dest);
  } catch {
    fs.cpSync(uploadsDir, dest, { recursive: true, errorOnExist: true });
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  return true;
}

/**
 * Makes `dest` a snapshot of the receipts folder. Hard links first (instant, no extra disk space, and unaffected when the
 * app later unlinks the original); a plain copy for any file that cannot be linked. Returns the number of files captured.
 * Receipt files are only ever created or unlinked by the app, never rewritten in place, so a link is a faithful snapshot.
 */
export function snapshotUploadsTo(dest: string, uploadsDir: string = UPLOADS_DIR): number {
  if (!fs.existsSync(uploadsDir)) return 0;
  const names = fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  if (names.length === 0) return 0;
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const name of names) {
    const from = path.join(uploadsDir, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) continue; // a repeated call into the same folder is harmless
    try {
      fs.linkSync(from, to);
    } catch {
      fs.copyFileSync(from, to);
    }
  }
  return names.length;
}
