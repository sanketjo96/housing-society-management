import multer from 'multer';

// Cross-cutting requirement (CLAUDE.md): file upload validation enforced server-side,
// not just by the frontend's <input accept>. memoryStorage, not diskStorage — the
// buffer is handed to whichever StorageAdapter is active (src/lib/storage), which may
// not even be local disk.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, PDF.`));
      return;
    }
    cb(null, true);
  },
});
