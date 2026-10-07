export async function pollAIVideoStatus(jobId, options = {}) {
  const {
    interval = 1000,
    maxAttempts = 120,
    signal
  } = options;

  const getToken = () => localStorage.getItem("token");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error("Polling cancelled");
    }

    let response;
    try {
      response = await fetch(`/api/ai/status/${jobId}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
         throw new Error("Polling cancelled");
      }
      throw new Error(`Network error during polling: ${err.message}`);
    }

    if (response.status === 404) {
      throw new Error("Job not found");
    }

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error("Invalid JSON response");
    }

    if (data.status === "ready") {
      return {
        videoUrl: data.cloudinary_url || data.videoUrl || null,
        transcriptName: data.transcript_name || data.transcriptName || null,
      };
    }

    if (data.status === "failed") {
      throw new Error("Video generation failed");
    }

    if (data.status === "not_found") {
       throw new Error("Job not found");
    }

    // Wait before next attempt
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, interval);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            resolve();
          }, { once: true });
        }
      });
    }
  }

  throw new Error("Polling timed out");
}
