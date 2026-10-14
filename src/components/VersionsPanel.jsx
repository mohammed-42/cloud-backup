import { useEffect } from 'react';
import { formatBytes, formatDate } from '../lib/format';

export default function VersionsPanel({ backup, busyKey, onClose, onDownload, onRestore, onUploadVersion }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="versions-title">
        <div className="modal-head">
          <div>
            <h2 id="versions-title">{backup.filename}</h2>
            <p className="muted">{backup.versions.length} saved {backup.versions.length === 1 ? 'version' : 'versions'}. Restoring never deletes a version.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-toolbar">
          <button className="btn primary" onClick={onUploadVersion} disabled={busyKey === 'upload'}>
            {busyKey === 'upload' ? 'Uploading...' : 'Upload new version'}
          </button>
        </div>

        <ol className="timeline">
          {backup.versions.map((v) => {
            const isCurrent = v.version_number === backup.currentVersion;
            return (
              <li key={v.id} className={isCurrent ? 'tl-item current' : 'tl-item'}>
                <span className="tl-dot" aria-hidden="true" />
                <div className="tl-main">
                  <div className="tl-title">
                    <strong>Version {v.version_number}</strong>
                    {isCurrent && <span className="badge">Current</span>}
                  </div>
                  <div className="muted small-text">{formatDate(v.created_at)} &middot; {formatBytes(v.file_size)}</div>
                </div>
                <div className="tl-actions">
                  <button className="btn" onClick={() => onDownload(v)} disabled={busyKey === `dl-${v.id}`}>
                    {busyKey === `dl-${v.id}` ? 'Preparing...' : 'Download'}
                  </button>
                  {!isCurrent && (
                    <button className="btn" onClick={() => onRestore(v)} disabled={busyKey === `rs-${v.id}`}>
                      {busyKey === `rs-${v.id}` ? 'Restoring...' : 'Restore'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
