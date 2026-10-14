import { supabase, BUCKET } from './supabase';
import { validateFile, resolveMime, versionedFilename } from './validation';

function friendly(error, fallback) {
  const msg = error?.message || '';
  if (/failed to fetch|networkerror|network request/i.test(msg)) {
    return 'Network error. Check your internet connection and try again.';
  }
  return msg || fallback;
}

export async function listBackups() {
  const { data, error } = await supabase
    .from('backups')
    .select('id, filename, current_version, created_at, updated_at, backup_versions(id, version_number, storage_path, file_size, mime_type, status, created_at)')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(friendly(error, 'Could not load your backups.'));

  return (data || [])
    .map((b) => {
      const versions = (b.backup_versions || [])
        .filter((v) => v.status === 'ready')
        .sort((a, z) => z.version_number - a.version_number);
      const current = versions.find((v) => v.version_number === b.current_version) || versions[0];
      return { id: b.id, filename: b.filename, currentVersion: b.current_version, createdAt: b.created_at, updatedAt: b.updated_at, versions, current };
    })
    .filter((b) => b.versions.length > 0);
}

/**
 * Upload a file. With backupId it becomes a new version of that backup,
 * without it a brand new backup (version 1) is created.
 * Flow: reserve version (RPC) -> upload to Storage -> finalize (RPC). Undo on failure.
 */
export async function uploadBackup(file, backupId = null) {
  const problem = validateFile(file);
  if (problem) throw new Error(problem);
  const mime = resolveMime(file);

  const { data: started, error: startErr } = await supabase.rpc('start_upload', {
    p_backup_id: backupId,
    p_filename: file.name.trim(),
    p_size: file.size,
    p_mime: mime,
  });
  if (startErr) throw new Error(friendly(startErr, 'Could not start the upload.'));

  const undo = async () => {
    await supabase.storage.from(BUCKET).remove([started.storage_path]).catch(() => {});
    await supabase.rpc('abort_upload', { p_version_id: started.version_id }).catch(() => {});
  };

  try {
    const body = new Blob([file], { type: mime });
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(started.storage_path, body, { contentType: mime, upsert: false, cacheControl: '3600' });
    if (upErr) throw upErr;

    const { error: finErr } = await supabase.rpc('finalize_upload', { p_version_id: started.version_id });
    if (finErr) throw finErr;
  } catch (err) {
    await undo();
    throw new Error(friendly(err, 'Upload failed. Nothing was saved.'));
  }
  return { backupId: started.backup_id, versionNumber: started.version_number };
}

/** Download one version through a short-lived signed URL (private bucket). */
export async function downloadVersion(backup, version) {
  const name = versionedFilename(backup.filename, version.version_number);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(version.storage_path, 60, { download: name });
  if (error || !data?.signedUrl) {
    throw new Error(friendly(error, 'The file could not be found in cloud storage.'));
  }
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Make an older version the current one. Nothing is copied or deleted. */
export async function restoreVersion(backupId, versionNumber) {
  const { error } = await supabase.rpc('restore_version', {
    p_backup_id: backupId,
    p_version_number: versionNumber,
  });
  if (error) throw new Error(friendly(error, 'Could not restore this version.'));
}

/** Delete files from Storage first, then the database rows. */
export async function deleteBackup(backup) {
  // Also include unfinished (pending) versions, if any, so no file is orphaned.
  const { data: rows, error: selErr } = await supabase
    .from('backup_versions').select('storage_path').eq('backup_id', backup.id);
  if (selErr) throw new Error(friendly(selErr, 'Could not read the backup before deleting.'));

  const paths = (rows || []).map((r) => r.storage_path);
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) throw new Error(friendly(rmErr, 'Could not delete the stored files. The backup was kept.'));
  }
  const { error } = await supabase.rpc('delete_backup', { p_backup_id: backup.id });
  if (error) throw new Error(friendly(error, 'Files were removed but the record could not be deleted.'));
}
