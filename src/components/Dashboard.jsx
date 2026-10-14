import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listBackups, uploadBackup, downloadVersion, restoreVersion, deleteBackup } from '../lib/backups';
import { formatBytes, formatDate } from '../lib/format';
import VersionsPanel from './VersionsPanel.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

export default function Dashboard({ user }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const newFileRef = useRef(null);
  const versionFileRef = useRef(null);
  const versionTargetRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((kind, text) => {
    setToast({ kind, text });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoadError('');
      setBackups(await listBackups());
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); return () => clearTimeout(toastTimer.current); }, [refresh]);

  const stats = useMemo(() => ({
    files: backups.length,
    versions: backups.reduce((n, b) => n + b.versions.length, 0),
    bytes: backups.reduce((n, b) => n + b.versions.reduce((s, v) => s + Number(v.file_size), 0), 0),
  }), [backups]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? backups.filter((b) => b.filename.toLowerCase().includes(q)) : backups;
  }, [backups, query]);

  const openBackup = backups.find((b) => b.id === openId) || null;

  async function runUpload(file, backupId) {
    if (!file) return;
    setUploading(true);
    setBusyKey('upload');
    try {
      const res = await uploadBackup(file, backupId);
      showToast('ok', `Saved ${file.name} as version ${res.versionNumber}.`);
      await refresh();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setUploading(false);
      setBusyKey('');
    }
  }

  function onPickNew(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    runUpload(file, null);
  }

  function onPickVersion(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    runUpload(file, versionTargetRef.current);
  }

  function chooseVersionFile(backupId) {
    versionTargetRef.current = backupId;
    versionFileRef.current?.click();
  }

  async function handleDownload(backup, version) {
    setBusyKey(`dl-${version.id}`);
    try {
      await downloadVersion(backup, version);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusyKey('');
    }
  }

  async function handleRestore(backup, version) {
    setBusyKey(`rs-${version.id}`);
    try {
      await restoreVersion(backup.id, version.version_number);
      showToast('ok', `Version ${version.version_number} of ${backup.filename} is now the current version.`);
      await refresh();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setBusyKey('');
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteBackup(deleteTarget);
      showToast('ok', `Deleted ${deleteTarget.filename} and all of its versions.`);
      if (openId === deleteTarget.id) setOpenId(null);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>Vaultline</span></div>
        <div className="topbar-right">
          <span className="user-email" title={user.email}>{user.email}</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Log out</button>
        </div>
      </header>

      <main className="content">
        <section className="stats" aria-label="Storage summary">
          <div className="stat"><span className="stat-value">{stats.files}</span><span className="stat-label">Backed-up files</span></div>
          <div className="stat"><span className="stat-value">{stats.versions}</span><span className="stat-label">Saved versions</span></div>
          <div className="stat"><span className="stat-value">{formatBytes(stats.bytes)}</span><span className="stat-label">Storage used</span></div>
        </section>

        <section className="toolbar">
          <input
            type="search" className="search" placeholder="Search files by name"
            value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search files"
          />
          <button className="btn primary" onClick={() => newFileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload file'}
          </button>
          <input ref={newFileRef} type="file" hidden onChange={onPickNew} />
          <input ref={versionFileRef} type="file" hidden onChange={onPickVersion} />
        </section>

        {uploading && <div className="progress" role="progressbar" aria-label="Uploading"><span /></div>}

        {loading ? (
          <div className="panel center-text"><div className="spinner" aria-label="Loading backups" /></div>
        ) : loadError ? (
          <div className="panel center-text">
            <p className="msg error">{loadError}</p>
            <button className="btn" onClick={() => { setLoading(true); refresh(); }}>Try again</button>
          </div>
        ) : backups.length === 0 ? (
          <div className="panel empty">
            <h2>No backups yet</h2>
            <p className="muted">Upload a file and it is stored privately in the cloud. Upload a changed copy later and the old one stays available.</p>
            <button className="btn primary" onClick={() => newFileRef.current?.click()} disabled={uploading}>Upload your first file</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="panel empty"><p className="muted">No files match &ldquo;{query}&rdquo;.</p></div>
        ) : (
          <div className="list" role="table" aria-label="Backups">
            <div className="row head" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Version</span>
              <span role="columnheader">Size</span>
              <span role="columnheader">Last updated</span>
              <span role="columnheader" className="right">Actions</span>
            </div>
            {visible.map((b) => (
              <div className="row" role="row" key={b.id}>
                <span role="cell" className="name" title={b.filename}>{b.filename}</span>
                <span role="cell"><span className="badge">v{b.currentVersion}</span> <span className="muted small-text">of {b.versions.length}</span></span>
                <span role="cell">{formatBytes(b.current?.file_size)}</span>
                <span role="cell" className="muted">{formatDate(b.updatedAt)}</span>
                <span role="cell" className="actions">
                  <button className="btn" onClick={() => setOpenId(b.id)}>Versions</button>
                  <button className="btn" onClick={() => b.current && handleDownload(b, b.current)} disabled={busyKey === `dl-${b.current?.id}`}>
                    {busyKey === `dl-${b.current?.id}` ? 'Preparing...' : 'Download'}
                  </button>
                  <button className="btn danger-outline" onClick={() => setDeleteTarget(b)}>Delete</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {openBackup && (
        <VersionsPanel
          backup={openBackup}
          busyKey={busyKey}
          onClose={() => setOpenId(null)}
          onDownload={(v) => handleDownload(openBackup, v)}
          onRestore={(v) => handleRestore(openBackup, v)}
          onUploadVersion={() => chooseVersionFile(openBackup.id)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this backup?"
          confirmLabel="Delete permanently"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        >
          <p><strong>{deleteTarget.filename}</strong> and all {deleteTarget.versions.length} of its {deleteTarget.versions.length === 1 ? 'version' : 'versions'} will be removed from cloud storage. This cannot be undone.</p>
        </ConfirmDialog>
      )}

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
}
