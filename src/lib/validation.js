
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, same as the bucket limit

export const ALLOWED_MIME = [
  'text/plain', 'text/csv', 'text/markdown', 'application/json',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];


const EXT_MIME = {
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', zip: 'application/zip', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function getExtension(name = '') {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function resolveMime(file) {
  const type = (file.type || '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'application/octet-stream') return type;
  return EXT_MIME[getExtension(file.name)] || '';
}


export function validateFile(file) {
  if (!file) return 'No file selected.';
  const name = (file.name || '').trim();
  if (!name) return 'The file needs a name.';
  if (name.length > 255) return 'File name is longer than 255 characters.';
  if (/[\\/]/.test(name)) return 'File name must not contain slashes.';
  if (file.size <= 0) return 'The file is empty.';
  if (file.size > MAX_FILE_SIZE) return 'File is larger than the 10 MB limit.';
  const mime = resolveMime(file);
  if (!mime || !ALLOWED_MIME.includes(mime)) {
    return 'This file type is not allowed. Use text, CSV, JSON, PDF, images, ZIP or Office documents.';
  }
  return null;
}


export function versionedFilename(filename, versionNumber) {
  const i = filename.lastIndexOf('.');
  if (i <= 0) return `${filename}_v${versionNumber}`;
  return `${filename.slice(0, i)}_v${versionNumber}${filename.slice(i)}`;
}
