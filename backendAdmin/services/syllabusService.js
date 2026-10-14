const DEFAULT_TIMEOUT_MS = 15000;

export class SyllabusServiceError extends Error {
  constructor(message) {
    super(message);
    this.name = "SyllabusServiceError";
  }
}

export const requestSyllabus = async (
  course,
  {
    fetchImpl = fetch,
    serviceUrl = process.env.SYLLABUS_SERVICE_URL,
    timeoutMs = Number(process.env.SYLLABUS_SERVICE_TIMEOUT_MS) ||
      DEFAULT_TIMEOUT_MS,
    signal,
  } = {},
) => {
  if (!serviceUrl) {
    throw new SyllabusServiceError(
      "Syllabus service is temporarily unavailable. Please retry.",
    );
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromRequest = () => controller.abort();
  signal?.addEventListener("abort", abortFromRequest, { once: true });
  if (signal?.aborted) controller.abort();

  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetchImpl(
      `${serviceUrl.replace(/\/+$/, "")}/generate-syllabus`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_title: course.title,
          category: course.category,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new SyllabusServiceError(
        "Syllabus service is temporarily unavailable. Please retry.",
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new SyllabusServiceError(
        "Syllabus service returned an invalid response. Please retry.",
      );
    }

    if (data?.error || !Array.isArray(data?.modules)) {
      throw new SyllabusServiceError(
        "Syllabus service could not complete the request. Please retry.",
      );
    }

    return data;
  } catch (error) {
    if (error instanceof SyllabusServiceError) throw error;
    if (timedOut) {
      throw new SyllabusServiceError(
        "Syllabus generation timed out. Please retry.",
      );
    }
    if (signal?.aborted) throw error;
    throw new SyllabusServiceError(
      "Syllabus service is temporarily unavailable. Please retry.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromRequest);
  }
};
