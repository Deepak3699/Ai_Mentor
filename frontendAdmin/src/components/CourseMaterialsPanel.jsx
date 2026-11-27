/**
 * CourseMaterialsPanel
 *
 * Design decisions
 * ─────────────────
 * • Implemented as a **separate component** (not an edit of CourseBuilderModal) so
 *   that the syllabus view and the materials panel can grow independently and be
 *   tested in isolation.  CourseBuilderModal renders this panel in a second tab.
 * • Polling is bounded to POLL_MAX_ROUNDS and cleared on unmount; it only runs
 *   while at least one material is in a transient state (pending | processing).
 * • File validation (type + size) mirrors the server limits from CODE-18 and
 *   happens entirely on the client before any network request is made.
 * • The existing ConfirmDeleteModal (requires typing DELETE + 3 s countdown) is
 *   intentionally NOT reused here because deleting a material is much lower-stakes
 *   than deleting a whole course. A lightweight inline confirmation row is used
 *   instead, keeping the UX proportional to the action.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { materialsApi } from "../utils/api";
import { useToast } from "../context/ToastContext";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Allowed MIME types — must mirror server validation from CODE-18 */
const ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ALLOWED_EXT = [".pdf", ".txt", ".doc", ".docx"];

/** Max file size in bytes (10 MB — mirrors server limit) */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** How often to re-poll while materials are still processing (ms) */
const POLL_INTERVAL_MS = 4_000;

/** Stop polling automatically after this many rounds (prevents infinite loops) */
const POLL_MAX_ROUNDS = 75; // 75 × 4 s = 5 minutes max

/** Human-readable labels for the status badge */
const STATUS_META = {
  pending:    { label: "Pending",    color: "text-amber-600  bg-amber-500/10  border-amber-500/20"   },
  processing: { label: "Processing", color: "text-blue-600   bg-blue-500/10   border-blue-500/20"    },
  indexed:    { label: "Indexed",    color: "text-teal-600   bg-teal-500/10   border-teal-500/20"    },
  failed:     { label: "Failed",     color: "text-red-600    bg-red-500/10    border-red-500/20"      },
};

/** Friendly messages for known server error codes */
const FRIENDLY_ERRORS = {
  FILE_TOO_LARGE:    "The file exceeds the 10 MB limit.",
  UNSUPPORTED_TYPE:  "File type not supported. Use PDF, TXT, DOC or DOCX.",
  COURSE_NOT_FOUND:  "Course not found. Please refresh and try again.",
  QUOTA_EXCEEDED:    "Storage quota exceeded. Contact support.",
};

function friendlyError(err) {
  const raw = err?.message || "";
  for (const [code, msg] of Object.entries(FRIENDLY_ERRORS)) {
    if (raw.includes(code)) return msg;
  }
  // Never expose raw server internals
  return "Something went wrong. Please try again.";
}

// ─── Helper: format bytes ─────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Helper: format date ──────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: "text-muted bg-canvas-alt border-border" };
  const Icon =
    status === "indexed"    ? CheckCircle2 :
    status === "failed"     ? XCircle       :
    status === "processing" ? RefreshCw     :
                              Clock;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${meta.color}`}
    >
      <Icon
        className={`w-3 h-3 ${status === "processing" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}

// ─── MaterialRow ─────────────────────────────────────────────────────────────

function MaterialRow({ material, onDeleteRequest }) {
  return (
    <tr className="border-b border-border hover:bg-canvas-alt/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-main truncate max-w-[200px]" title={material.title}>
            {material.title}
          </span>
        </div>
        <div className="text-xs text-muted mt-0.5 ml-6 truncate max-w-[200px]" title={material.filename}>
          {material.filename}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">
        {formatBytes(material.size)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={material.status} />
        {material.status === "failed" && material.errorCode && (
          <div className="mt-1 text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            {FRIENDLY_ERRORS[material.errorCode] ?? "Processing failed."}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">
        {material.chunkCount ?? "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
        {formatDate(material.indexedAt)}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onDeleteRequest(material)}
          aria-label={`Delete material ${material.title}`}
          className="w-8 h-8 rounded-xl border border-border flex items-center justify-center hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

// ─── DeleteConfirmRow (lightweight inline confirm) ────────────────────────────

function DeleteConfirmRow({ material, onConfirm, onCancel, isDeleting }) {
  return (
    <tr className="bg-red-500/5 border-b border-red-500/20">
      <td colSpan={6} className="px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            Delete <span className="font-bold">"{material.title}"</span>? This cannot be undone.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-canvas-alt transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-semibold flex items-center gap-1 hover:bg-red-600 transition-all disabled:opacity-50"
              aria-label={`Confirm delete ${material.title}`}
            >
              {isDeleting ? (
                <><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />Deleting…</>
              ) : (
                <><Trash2 className="w-3 h-3" aria-hidden="true" />Delete</>
              )}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── UploadZone ───────────────────────────────────────────────────────────────

function UploadZone({ courseId, onUploaded }) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const validate = (file) => {
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXT.some((e) => file.name.endsWith(e))) {
      return `"${file.name}" is not supported. Allowed types: PDF, TXT, DOC, DOCX.`;
    }
    if (file.size > MAX_FILE_BYTES) {
      return `"${file.name}" exceeds the 10 MB limit (${formatBytes(file.size)}).`;
    }
    return null;
  };

  const upload = useCallback(
    async (file) => {
      const error = validate(file);
      if (error) {
        showToast(error, "error");
        return;
      }
      try {
        setUploading(true);
        const result = await materialsApi.upload(courseId, file);
        showToast(`"${result.title ?? file.name}" uploaded successfully.`, "success");
        onUploaded();
      } catch (err) {
        showToast(friendlyError(err), "error");
      } finally {
        setUploading(false);
        // Reset input so the same file can be re-uploaded after a failure
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [courseId, onUploaded, showToast],
  );

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) upload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      role="region"
      aria-label="Upload course material"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`rounded-2xl border-2 border-dashed transition-all p-6 flex flex-col items-center gap-3 text-center
        ${dragOver ? "border-teal-400 bg-teal-500/5" : "border-border hover:border-teal-400/50 bg-canvas-alt/30"}`}
    >
      <Upload
        className={`w-8 h-8 ${dragOver ? "text-teal-500" : "text-muted"}`}
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-semibold text-main">
          Drag &amp; drop a file here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-teal-500 hover:underline disabled:opacity-50"
            aria-label="Browse files to upload"
          >
            browse
          </button>
        </p>
        <p className="text-xs text-muted mt-1">PDF, TXT, DOC or DOCX · max 10 MB</p>
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Uploading…
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXT.join(",")}
        className="sr-only"
        aria-label="Choose file to upload"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading}
        data-testid="material-file-input"
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CourseMaterialsPanel({ courseId }) {
  const { showToast } = useToast();
  const [materials, setMaterials]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);   // material being confirmed
  const [deleting, setDeleting]         = useState(false);
  const pollRoundRef                    = useRef(0);
  const pollTimerRef                    = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchMaterials = useCallback(async () => {
    try {
      const data = await materialsApi.list(courseId);
      setMaterials(Array.isArray(data) ? data : data?.materials ?? []);
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setLoading(false);
    }
  }, [courseId, showToast]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollRoundRef.current = 0;
  }, []);

  const hasTransient = (list) =>
    list.some((m) => m.status === "pending" || m.status === "processing");

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Start / stop polling when the materials list changes
  useEffect(() => {
    if (!hasTransient(materials)) {
      stopPolling();
      return;
    }

    if (pollTimerRef.current) return; // already running

    pollTimerRef.current = setInterval(async () => {
      pollRoundRef.current += 1;
      if (pollRoundRef.current > POLL_MAX_ROUNDS) {
        stopPolling();
        return;
      }
      try {
        const data = await materialsApi.list(courseId);
        const updated = Array.isArray(data) ? data : data?.materials ?? [];
        setMaterials(updated);
        if (!hasTransient(updated)) stopPolling();
      } catch {
        // silent — polling failure shouldn't interrupt the UI
      }
    }, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [materials, courseId, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await materialsApi.remove(courseId, pendingDelete.id);
      showToast(`"${pendingDelete.title}" deleted.`, "success");
      setMaterials((prev) => prev.filter((m) => m.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      showToast(friendlyError(err), "error");
    } finally {
      setDeleting(false);
    }
  }, [courseId, pendingDelete, showToast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby="materials-panel-title" className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 id="materials-panel-title" className="text-lg font-semibold text-main">
          Course Materials
        </h4>
        {hasTransient(materials) && (
          <span className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
            <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
            Updating…
          </span>
        )}
      </div>

      {/* Upload zone */}
      <UploadZone courseId={courseId} onUploaded={fetchMaterials} />

      {/* Materials table */}
      {loading ? (
        <div className="text-center py-10 text-muted text-sm flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading materials…
        </div>
      ) : materials.length === 0 ? (
        <div
          className="text-center py-14 border-2 border-dashed border-border rounded-2xl bg-canvas-alt/50"
          data-testid="materials-empty"
        >
          <FileText className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" aria-hidden="true" />
          <p className="text-main font-medium">No materials yet</p>
          <p className="text-sm text-muted mt-1">Upload a document to get started.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden" data-testid="materials-table">
          <table className="w-full text-left" aria-label="Course materials">
            <thead className="bg-canvas-alt/60">
              <tr className="text-[11px] font-black uppercase tracking-widest text-muted border-b border-border">
                <th scope="col" className="px-4 py-2.5">Title / File</th>
                <th scope="col" className="px-4 py-2.5">Size</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5">Chunks</th>
                <th scope="col" className="px-4 py-2.5">Indexed</th>
                <th scope="col" className="px-4 py-2.5 sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) =>
                pendingDelete?.id === m.id ? (
                  <DeleteConfirmRow
                    key={m.id}
                    material={m}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setPendingDelete(null)}
                    isDeleting={deleting}
                  />
                ) : (
                  <MaterialRow
                    key={m.id}
                    material={m}
                    onDeleteRequest={setPendingDelete}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
