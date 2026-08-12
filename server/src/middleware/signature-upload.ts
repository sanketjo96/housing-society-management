import multer from 'multer';

// A treasurer's signature is an image only (the spec explicitly says "PNG with
// transparent background recommended") — deliberately not a reuse of proofUpload,
// which also allows application/pdf; that makes no sense for something embedded
// into a receipt as a picture. Tighter size cap than the 5MB proof default too — a
// signature is a small graphic, not a scanned document.
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, WEBP.`));
      return;
    }
    cb(null, true);
  },
});
