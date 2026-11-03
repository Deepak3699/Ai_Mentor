
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import API_BASE_URL, { apiFetch } from "../lib/api";
import { getErrorMessage } from "../lib/errorHandling.js";

const Success = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const courseId = searchParams.get("courseId");
  const courseTitle =
    searchParams.get("title") || `Course ${courseId || ""}`;

  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const requestInFlight = useRef(false);

  const savePurchase = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;

    try {
      if (
        !courseId ||
        !Number.isFinite(Number(courseId)) ||
        Number(courseId) <= 0
      ) {
        setStatus("error");
        setErrorMessage(t("courses.enrollmentFailed"));
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      const response = await apiFetch(
        `${API_BASE_URL}/api/users/purchase-course`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            courseId: Number(courseId),
            courseTitle,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok) {
        if (
          response.status === 409 &&
          data?.error?.code === "CONFLICT" &&
          data?.error?.message === "Already enrolled"
        ) {
          setStatus("success");
          return;
        }

        throw {
          response: { status: response.status, data },
          message: getErrorMessage(
            { response: { status: response.status, data } },
            t("courses.paymentEnrollmentHelp")
          ),
        };
      }

      window.dispatchEvent(new Event("refreshNotifications"));
      setStatus("success");
    } catch (error) {
      console.error("Error saving purchase:", error);
      setErrorMessage(
        getErrorMessage(error, t("courses.enrollmentFailed"))
      );
      setStatus("error");
    } finally {
      requestInFlight.current = false;
    }
  }, [courseId, courseTitle, navigate, t]);

  useEffect(() => {
    savePurchase();
  }, [savePurchase, attempt]);

  useEffect(() => {
    if (status !== "success" || !courseId) return undefined;

    const timeout = window.setTimeout(() => {
      navigate(`/learning/${courseId}`, { replace: true });
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [status, courseId, navigate]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t("courses.enrolling")}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold text-red-600">
          {t("courses.enrollmentFailed")}
        </h1>
        <p className="max-w-lg text-gray-500">{errorMessage}</p>
        <p className="max-w-lg text-sm text-gray-500">
          {t("courses.paymentEnrollmentHelp")}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((current) => current + 1)}
          className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700"
        >
          {t("common.workspace.retry")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/courses")}
          className="text-blue-600 underline"
        >
          {t("courses.backToCourses")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-4">
      <h1 className="text-xl font-bold text-green-600">
        {t("courses.paymentSuccessful")}
      </h1>
      <p className="text-gray-500">
        {t("courses.continueLearning")}
      </p>
    </div>
  );
};

export default Success;
