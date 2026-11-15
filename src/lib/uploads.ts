import 'server-only';
import fs from 'node:fs';
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
