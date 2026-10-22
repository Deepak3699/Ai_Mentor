// backend/utils/uploadUtils.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stable upload directory rooted in backend/uploads regardless of process.cwd()
export const UPLOAD_DIR = path.resolve(__dirname, "../uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Ensures the target path is strictly within UPLOAD_DIR (no directory traversal).
 */
export const isPathInsideUploadDir = (filePath) => {
  if (!filePath || typeof filePath !== "string") return false;
  const resolved = path.resolve(filePath);
  const relative = path.relative(UPLOAD_DIR, resolved);
  return !relative.startsWith("..") && !path.isAbsolute(relative) && relative.length > 0;
};

/**
 * Safely removes a file, ignoring missing files and logging unexpected errors without leaking paths.
 */
export const safeDeleteFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      const safeFilename = path.basename(filePath);
      console.warn(
        `[UPLOAD_CLEANUP] Failed to remove file (${safeFilename}):`,
        error.code || error.message,
      );
    }
  }
};

/**
 * Detects image format based on magic bytes (file signature).
 */
export const detectImageSignature = (buffer) => {
  if (!buffer || buffer.length < 4) return null;

  // PNG: \x89PNG\r\n\x1a\n (8 bytes)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: "image/png", ext: ".png" };
  }

  // JPEG: \xff\xd8\xff (3 bytes)
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }

  // GIF: GIF87a or GIF89a (6 bytes)
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mime: "image/gif", ext: ".gif" };
  }

  // WEBP: RIFF....WEBP (12 bytes)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: "image/webp", ext: ".webp" };
  }

  return null;
};

/**
 * Validates actual file bytes against claimed MIME type and extension.
 */
export const validateImageFile = async (filePath, claimedMime, claimedExt) => {
  let fd;
  try {
    fd = await fs.promises.open(filePath, "r");
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await fd.read(buffer, 0, 16, 0);

    if (bytesRead < 4) {
      return { valid: false, reason: "File too small or malformed" };
    }

    const signature = detectImageSignature(buffer.subarray(0, bytesRead));
    if (!signature) {
      return {
        valid: false,
        reason: "File signature does not match any approved image format",
      };
    }

    // Check claimed MIME matches detected format
    if (claimedMime && signature.mime !== claimedMime) {
      return {
        valid: false,
        reason: `MIME type mismatch (${signature.mime} vs ${claimedMime})`,
      };
    }

    // Check claimed extension matches detected format
    const ext = (claimedExt || "").toLowerCase();
    const validExts = signature.mime === "image/jpeg" ? [".jpg", ".jpeg"] : [signature.ext];
    if (claimedExt && !validExts.includes(ext)) {
      return {
        valid: false,
        reason: `File extension mismatch (${ext} vs ${signature.ext})`,
      };
    }

    return { valid: true, signature };
  } catch (error) {
    return { valid: false, reason: error.message };
  } finally {
    if (fd) {
      await fd.close().catch(() => {});
    }
  }
};
