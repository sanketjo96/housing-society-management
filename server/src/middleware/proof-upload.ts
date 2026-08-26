import multer from 'multer';

// memoryStorage, not diskStorage — the buffer is handed to whichever
// StorageAdapter is active, which may not be local disk.
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
