/**
 * Common API fetcher for Admin Panel.
 * Uses the /api proxy configured in vite.config.js.
 * Automatically attaches the JWT token from localStorage if available.
 */
export const callApi = async (path, options = {}) => {
  const token = localStorage.getItem("token");

  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || `Request failed with status ${response.status}`);
  }

  return data;
};

// ─── Course Materials API (CODE-18 endpoints) ─────────────────────────────────

/**
 * Helpers for the /admin/courses/:courseId/materials endpoints.
 *
 * upload  – POST  multipart/form-data with field "file"
 * list    – GET   returns { materials: [...] } or plain array
 * remove  – DELETE /admin/courses/:courseId/materials/:materialId
 */
export const materialsApi = {
  /**
   * Upload a file as a course material.
   * Uses raw fetch (not callApi) so it can send multipart/form-data
   * without overriding Content-Type (browser sets the boundary).
   */
  async upload(courseId, file) {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/admin/courses/${courseId}/materials`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.message || `Upload failed with status ${response.status}`);
    }

    return data;
  },

  /** List all materials for a course. */
  async list(courseId) {
    return callApi(`/admin/courses/${courseId}/materials`);
  },

  /** Delete a single material. */
  async remove(courseId, materialId) {
    return callApi(`/admin/courses/${courseId}/materials/${materialId}`, {
      method: "DELETE",
    });
  },
};
