import { apiFetch as fetch } from "../lib/api";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAIVideo } from "../service/aiService";
import {
  AIGenerationError,
  classifyGenerationError,
  fetchTranscript,
  isAbortError,
  pollAIVideoStatus,
} from "../service/aiGeneration";
import VideoPlayer from "../components/video/VideoPlayer";
import AITranscript from "../components/video/AITranscript";
import LearningToolbar from "../components/learning/LearningToolbar";
import VoiceoverDialog from "../components/learning/VoiceoverDialog";
import LessonActions from "../components/learning/LessonActions";
import "../components/learning/learning-workspace.css";
import { buildCuesFromText, hasTranscriptText } from "../service/transcript";
import FlashcardStudy from "../components/learning/FlashcardStudy";
import LoadingSpinner from "../components/common/LoadingSpinner";
import toast from "react-hot-toast";

import { ChevronRight, Home } from "lucide-react";

const TRANSCRIPT_PANEL_ID = "lesson-transcript-panel";

export default function Learning() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: courseId } = useParams();
  const { user, updateUser } = useAuth();
  const [learningData, setLearningData] = useState(null);
  const [isCelebrityModalOpen, setIsCelebrityModalOpen] = useState(false);

  // Captions state
  const [captions, setCaptions] = useState([]);
  const [activeCaption, setActiveCaption] = useState("");
  const celebrities = ["Salman Khan", "Modi ji", "SRK"];

  const celebrityVideoMap = {
    "Salman Khan": { video: "/videos/salman.mp4", vtt: "/videos/salman.vtt" },
    "Modi ji": { video: "/videos/modi.mp4", vtt: "/videos/modi.vtt" },
    SRK: { video: "/videos/srk.mp4", vtt: "/videos/srk.vtt" },
  };

  const [selectedCelebrity, setSelectedCelebrity] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [aiVideoUrl, setAiVideoUrl] = useState(null);
  const [isAIVideoLoading, setIsAIVideoLoading] = useState(false);
  const [isTranscriptFetching, setIsTranscriptFetching] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);
  const [generatedTextContent, setGeneratedTextContent] = useState("");
  const [aiGenerationError, setAiGenerationError] = useState(null);
  const [generationAttempt, setGenerationAttempt] = useState(0);
  const [isFlashcardStudyOpen, setIsFlashcardStudyOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isTranscriptDrawer, setIsTranscriptDrawer] = useState(false);

  const transcriptToggleRef = useRef(null);
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const videoCardRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const activeCaptionRef = useRef(null);
  const workspaceRef = useRef(null);
  const lastDrawerModeRef = useRef(null);
  const lastLessonIdRef = useRef(null);
  const lastCelebrityRef = useRef(null);
  const hasRestoredProgressRef = useRef(false);
  const jumpToTimeRef = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const generationRequestIdRef = useRef(0);
  const generationResumeRef = useRef(null);
  const playRequestedRef = useRef(false);
  const userRef = useRef(user);

  userRef.current = user;

  // Auto-scroll transcript
  useEffect(() => {
    if (activeCaptionRef.current && transcriptContainerRef.current) {
      const container = transcriptContainerRef.current;
      const activeElement = activeCaptionRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = activeElement.getBoundingClientRect();
      const elementTopRelative = elementRect.top - containerRect.top + container.scrollTop;
      const targetScrollTop =
        elementTopRelative - container.clientHeight / 2 + activeElement.clientHeight / 2;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const elementTop = elementRect.top - containerRect.top + container.scrollTop;
      const elementBottom = elementTop + activeElement.clientHeight;
      if (elementTop < containerTop || elementBottom > containerBottom) {
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
    }
  }, [currentTime]);

  // Fetch learning data
  useEffect(() => {
    const fetchLearningData = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`/api/courses/${courseId}/learning`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const courseData = await response.json();
          setLearningData(courseData);

          const findFullLesson = (id) =>
            courseData.modules.flatMap((m) => m.lessons).find((l) => l.id === id);

          const userProgress = user?.purchasedCourses?.find(
            (course) => course.courseId === parseInt(courseId),
          )?.progress;

          let initialLesson = null;

          if (location?.state?.lessonId) {
            initialLesson = findFullLesson(location.state.lessonId);
          }
          if (!initialLesson && userProgress?.currentLesson?.lessonId) {
            initialLesson = findFullLesson(userProgress.currentLesson.lessonId);
          }
          if (!initialLesson) {
            const defaultId =
              courseData.currentLesson?.id || courseData.modules?.[0]?.lessons?.[0]?.id;
            initialLesson = findFullLesson(defaultId);
          }

          if (initialLesson) courseData.currentLesson = initialLesson;
          setLearningData(courseData);

          if (userProgress && initialLesson) {
            if (!hasRestoredProgressRef.current) {
              hasRestoredProgressRef.current = true;
              const savedData = userProgress.lessonData?.[initialLesson.id];
              if (savedData?.generatedTextContent) {
                setGeneratedTextContent(savedData.generatedTextContent);
                if (savedData.aiVideoUrl) setAiVideoUrl(savedData.aiVideoUrl);
                if (savedData.celebrity) {
                  setSelectedCelebrity(savedData.celebrity);
                  lastCelebrityRef.current = savedData.celebrity;
                }
              }
              if (savedData?.watchHistory?.currentTime) {
                jumpToTimeRef.current = savedData.watchHistory.currentTime;
              }
              setLearningData((prev) => ({ ...prev, currentLesson: initialLesson }));
            }
          }
        } else {
          setLearningData(null);
        }
      } catch (error) {
        console.log(error);
        setLearningData(null);
      }
    };
    fetchLearningData();
    // The initial restore intentionally runs only when the course changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Reset restore flag on course change
  useEffect(() => {
    hasRestoredProgressRef.current = false;
  }, [courseId]);

  // Captions useEffect
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const generateFromText = (d) => {
      const cues = buildCuesFromText(generatedTextContent, d);
      if (!cues.length) return false;
      setCaptions(cues);
      return true;
    };

    const loadVTT = async () => {
      const vttPath = selectedCelebrity ? celebrityVideoMap[selectedCelebrity]?.vtt : null;
      if (!vttPath) {
        setCaptions([]);
        return;
      }
      try {
        const res = await fetch(vttPath);
        if (!res.ok) {
          setCaptions([]);
          return;
        }
        const text = await res.text();
        const blocks = text.replace(/\r\n/g, "\n").split(/\n\n+/).slice(1);
        const toSeconds = (s) => {
          const parts = s.split(":");
          if (parts.length === 3) {
            const [hh, mm, rest] = parts;
            const [ss, ms] = rest.split(".");
            return (
              parseInt(hh) * 3600 +
              parseInt(mm) * 60 +
              parseInt(ss) +
              parseFloat("0." + (ms || "0"))
            );
          } else {
            const [mm, rest] = parts;
            const [ss, ms] = rest.split(".");
            return parseInt(mm) * 60 + parseInt(ss) + parseFloat("0." + (ms || "0"));
          }
        };
        const cues = blocks
          .map((block) => {
            const lines = block
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length < 2) return null;
            const match = lines[0].match(
              /(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})/,
            );
            if (!match) return null;
            return {
              start: toSeconds(match[1]),
              end: toSeconds(match[2]),
              text: lines.slice(1).join(" "),
            };
          })
          .filter(Boolean);
        setCaptions(cues);
      } catch {
        setCaptions([]);
      }
    };

    const tryGenerate = () => {
      const d = video.duration;
      if (!isFinite(d) || d <= 0) return false;
      return generateFromText(d);
    };

    if (generatedTextContent) {
      if (tryGenerate()) return;
      const handler = () => {
        generateFromText(video.duration);
      };
      video.addEventListener("loadedmetadata", handler, { once: true });
      return () => video.removeEventListener("loadedmetadata", handler);
    }

    setCaptions([]);
    setActiveCaption("");
    if (video.duration && isFinite(video.duration) && video.duration > 0) {
      loadVTT();
    } else {
      const handler = () => {
        loadVTT();
      };
      video.addEventListener("loadedmetadata", handler, { once: true });
      return () => video.removeEventListener("loadedmetadata", handler);
    }
    // celebrityVideoMap is a static lookup recreated during render; selected values drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCelebrity, generatedTextContent, learningData?.currentLesson?.id]);

  const handleRetryGeneration = () => {
    generationResumeRef.current = aiGenerationError?.details?.jobId
      ? {
          jobId: aiGenerationError.details.jobId,
          lessonId: learningData?.currentLesson?.id,
          voice: selectedCelebrity,
        }
      : null;
    lastLessonIdRef.current = null;
    lastCelebrityRef.current = null;
    setAiGenerationError(null);
    setGenerationAttempt((attempt) => attempt + 1);
  };

  // Load video on lesson/celebrity change
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !learningData?.currentLesson) return;

    if (!selectedCelebrity) {
      // No generation flow for this selection. A cancelled flow no longer clears
      // the loading flag itself, and forgetting the celebrity lets re-selecting
      // the same one start a fresh generation.
      lastCelebrityRef.current = null;
      setIsAIVideoLoading(false);
      setIsTranscriptFetching(false);
      setTranscriptError(null);
      setAiGenerationError(null);
      return;
    }

    const lessonChanged = lastLessonIdRef.current !== learningData.currentLesson.id;
    const celebrityChanged = lastCelebrityRef.current !== selectedCelebrity;
    if (!lessonChanged && !celebrityChanged && v.src) return;

    const requestId = ++generationRequestIdRef.current;
    lastLessonIdRef.current = learningData.currentLesson.id;
    lastCelebrityRef.current = selectedCelebrity;

    // One controller per generation flow. The cleanup below aborts it when the
    // lesson/celebrity changes or the page unmounts, which cancels the pending
    // poll delay and any in-flight generate/status/transcript request.
    const controller = new AbortController();
    const { signal } = controller;
    const isStale = () => signal.aborted || requestId !== generationRequestIdRef.current;
    let finished = false;

    const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

    // Loads the transcript; resolves to false when this flow went stale.
    const loadTranscript = async (transcriptName) => {
      if (isStale()) return null;
      setIsTranscriptFetching(true);
      try {
        const transcript = await fetchTranscript(
          transcriptName,
          (name, { signal: requestSignal }) =>
            fetch(`/api/ai/transcript/${name}`, { headers: authHeaders(), signal: requestSignal }),
          { signal },
        );
        if (isStale()) return false;
        setGeneratedTextContent(transcript);
        return transcript;
      } catch (error) {
        if (isStale() || isAbortError(error)) return false;
        setTranscriptError(t("learning.no_transcript"));
        console.error("Transcript loading failed:", error);
      } finally {
        if (!isStale()) setIsTranscriptFetching(false);
      }
      return null;
    };

    const publishVideo = (result) => {
      if (isStale()) return;
      finished = true;
      setAiVideoUrl(result.videoUrl);
      setIsAIVideoLoading(false);
      setIsPlaying(true);
      playRequestedRef.current = false;
      const persist = async () => {
        const transcript = result.transcriptName
          ? await loadTranscript(result.transcriptName)
          : null;
        if (isStale()) return;
        await saveLessonData(learningData.currentLesson.id, {
          generatedTextContent: typeof transcript === "string" ? transcript : "",
          aiVideoUrl: result.videoUrl,
          celebrity: selectedCelebrity,
        });
      };
      void persist();
    };
    const loadVideo = async () => {
      setCaptions([]);
      setActiveCaption("");
      setAiGenerationError(null);
      setGeneratedTextContent("");
      setAiVideoUrl(null);
      setIsPlaying(false);
      setIsAIVideoLoading(true);
      setIsTranscriptFetching(false);
      setTranscriptError(null);

      const savedData = userRef.current?.purchasedCourses?.find(
        (c) => c.courseId === parseInt(courseId),
      )?.progress?.lessonData?.[learningData.currentLesson.id];
      const hasSavedMatchingContent =
        savedData?.celebrity === selectedCelebrity && savedData?.aiVideoUrl;

      if (hasSavedMatchingContent) {
        finished = true;
        setGeneratedTextContent(savedData.generatedTextContent);
        setAiVideoUrl(savedData.aiVideoUrl);
        setIsAIVideoLoading(false);
        if (playRequestedRef.current) setIsPlaying(true);
        playRequestedRef.current = false;
        return;
      }

      try {
        const payload = {
          courseId: parseInt(courseId),
          lessonId: learningData.currentLesson.id,
          celebrity: selectedCelebrity.split(" ")[0].toLowerCase(),
        };
        const resume = generationResumeRef.current;
        generationResumeRef.current = null;
        const data =
          resume &&
          resume.lessonId === learningData.currentLesson.id &&
          resume.voice === selectedCelebrity
            ? { jobId: resume.jobId }
            : await getAIVideo(payload, { signal });
        if (isStale()) return;

        if (data?.cached && data?.videoUrl) {
          publishVideo(data);
          return;
        }

        if (!data?.jobId) {
          throw new AIGenerationError("invalid_response", "The AI service returned no job ID.", {
            retryable: true,
          });
        }

        const result = await pollAIVideoStatus({
          jobId: data.jobId,
          signal,
          fetchStatus: (jobId, { signal: requestSignal }) =>
            fetch(`/api/ai/status/${jobId}`, { headers: authHeaders(), signal: requestSignal }),
        });

        if (isStale()) return;
        publishVideo(result);
      } catch (error) {
        // Cancelled flows (navigation, lesson/celebrity switch) are expected: stay silent.
        if (isStale() || isAbortError(error)) return;
        const generationError = classifyGenerationError(error);
        setAiGenerationError({
          type: generationError.type,
          message: generationError.message,
          retryable: generationError.retryable,
          details: generationError.details,
        });
        console.error("AI video generation failed:", {
          type: generationError.type,
          message: generationError.message,
          details: generationError.details,
        });
      } finally {
        finished = true;
        // Only the latest flow may touch the loading flag.
        if (!isStale()) setIsAIVideoLoading(false);
      }
    };

    loadVideo();
    return () => {
      generationRequestIdRef.current += 1;
      // A flow cut short never produced a result, so let the next run start fresh.
      if (!finished) {
        lastLessonIdRef.current = null;
        lastCelebrityRef.current = null;
      }
      controller.abort();
    };
    // This generation transaction is keyed by primitive identifiers; adding helper identities would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, generationAttempt, learningData?.currentLesson?.id, selectedCelebrity]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isFull);
    };

    const events = [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "MSFullscreenChange",
    ];
    events.forEach((event) => document.addEventListener(event, handleFullscreenChange));

    const video = videoRef.current;
    if (video) {
      video.addEventListener("webkitbeginfullscreen", () => setIsFullscreen(true));
      video.addEventListener("webkitendfullscreen", () => setIsFullscreen(false));
      const handleLoadedMetadata = () => {
        if (jumpToTimeRef.current !== null && jumpToTimeRef.current > 0) {
          const isAlmostFinished = jumpToTimeRef.current >= video.duration - 5;
          if (!isAlmostFinished) {
            video.currentTime = jumpToTimeRef.current;
            setCurrentTime(jumpToTimeRef.current);
          }
          jumpToTimeRef.current = null;
        }
      };
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    }

    return () => {
      events.forEach((event) => document.removeEventListener(event, handleFullscreenChange));
    };
  }, [videoRef]);

  // ─── Derived values (needed before functions) ───
  const { modules, currentLesson } = learningData || {};
  const allLessons = (modules || []).flatMap((module) => module.lessons || []);
  const currentLessonIndex = allLessons.findIndex((lesson) => lesson.id === currentLesson?.id);
  const currentCourseProgress = user?.purchasedCourses?.find(
    (course) => Number(course.courseId) === Number(courseId),
  )?.progress;
  const isCurrentLessonCompleted = currentCourseProgress?.completedLessons?.some(
    (completedLesson) => Number(completedLesson.lessonId) === Number(currentLesson?.id),
  );

  // ─── Helper functions ───
  const saveLessonData = async (lessonId, data) => {
    try {
      const token = localStorage.getItem("token");
      const mod = modules.find((m) => m.lessons?.some((l) => l.id === currentLesson.id));
      const res = await fetch("/api/users/course-progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseId: parseInt(courseId),
          lessonData: { lessonId, data },
          currentLesson: {
            lessonId,
            moduleTitle: mod.title || "",
          },
          completedLesson: { lessonId },
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (updateUser && result.purchasedCourses)
          updateUser({ purchasedCourses: result.purchasedCourses });
      }
    } catch (error) {
      console.error("Error saving lesson data:", error);
    }
  };

  const completeLesson = async (lessonId) => {
    const courseProgress = user?.purchasedCourses?.find(
      (course) => course.courseId === parseInt(courseId),
    )?.progress;
    const isAlreadyCompleted = courseProgress?.completedLessons?.some(
      (cl) => cl.lessonId === lessonId,
    );

    if (isAlreadyCompleted) {
      console.log("Lesson already completed, skipping");
      return;
    } else {
      toast.error("Please watch the video before continuing.");
    }
  };

  const handleLessonClick = (lesson) => {
    if (currentLesson?.id === lesson.id) return;
    setIsFlashcardStudyOpen(false);
    setGeneratedTextContent(null);
    setAiVideoUrl(null);
    setLearningData((prev) => ({ ...prev, currentLesson: lesson }));
    const savedData = user?.purchasedCourses?.find((c) => c.courseId === parseInt(courseId))
      ?.progress?.lessonData?.[lesson.id];
    jumpToTimeRef.current = savedData?.watchHistory?.currentTime || 0;
  };

  const handlePrevious = useCallback(() => {
    if (currentLessonIndex > 0) {
      handleLessonClick(allLessons[currentLessonIndex - 1]);
    }
    // Navigation callbacks intentionally follow the derived lesson index/list for this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLessonIndex, allLessons]);

  const handleNext = useCallback(async () => {
    if (currentLessonIndex >= allLessons.length - 1) return;
    setIsNavigating(true);
    if (currentLesson?.id) await completeLesson(currentLesson.id);
    handleLessonClick(allLessons[currentLessonIndex + 1]);
    setIsNavigating(false);
    // Navigation callbacks intentionally follow derived lesson data; helper identities are render-local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLessonIndex, allLessons, currentLesson]);

  const togglePlay = useCallback(() => {
    if (!selectedCelebrity) {
      setIsCelebrityModalOpen(true);
      return;
    }
    if (isAIVideoLoading) return;
    if (!aiVideoUrl) {
      playRequestedRef.current = true;
      lastLessonIdRef.current = null;
      lastCelebrityRef.current = null;
      setGenerationAttempt((attempt) => attempt + 1);
      return;
    }
    setIsPlaying((playing) => !playing);
  }, [selectedCelebrity, isAIVideoLoading, aiVideoUrl]);

  const cancelGeneration = () => {
    playRequestedRef.current = false;
    setSelectedCelebrity(null);
    setIsPlaying(false);
    setAiVideoUrl(null);
    setGeneratedTextContent("");
    setCaptions([]);
    setActiveCaption("");
    setCurrentTime(0);
    setDuration(0);
    setProgress(0);
  };

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      if (!isMuted && volume === 0) {
        setVolume(0.5);
        videoRef.current.volume = 0.5;
      }
    }
  }, [isMuted, volume]);

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current;
    if (!container) return;
    const isFull = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    if (!isFull) {
      const req =
        container.requestFullscreen ||
        container.webkitRequestFullscreen ||
        container.mozRequestFullScreen ||
        container.msRequestFullscreen;
      if (req) req.call(container).catch(console.error);
    } else {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen;
      if (exit) exit.call(document);
    }
  }, []);

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
      setIsMuted(newVolume === 0);
    }
  };

  const handleProgress = () => {
    if (videoRef.current) {
      const vidDuration = videoRef.current.duration;
      const vidCurrentTime = videoRef.current.currentTime;
      if (isFinite(vidDuration) && vidDuration > 0) setDuration(vidDuration);
      setCurrentTime(vidCurrentTime);
      const currentProgressPercent = vidDuration > 0 ? (vidCurrentTime / vidDuration) * 100 : 0;
      setProgress(currentProgressPercent);

      if (Math.abs(vidCurrentTime - lastSavedTimeRef.current) >= 5) {
        lastSavedTimeRef.current = vidCurrentTime;
        if (
          learningData?.currentLesson &&
          isFinite(vidDuration) &&
          vidDuration > 0 &&
          !isNaN(currentProgressPercent)
        ) {
          const formatDurationString = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m}:${s < 10 ? "0" : ""}${s}`;
          };
          const safeProgress = Math.max(0, Math.min(100, currentProgressPercent));
          saveLessonData(learningData.currentLesson.id, {
            watchHistory: {
              currentTime: vidCurrentTime,
              duration: vidDuration,
              progressPercent: safeProgress,
              lastWatched: new Date().toISOString(),
              title: learningData.currentLesson.title || "Lesson Video",
              thumbnail:
                "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop",
              formattedDuration: formatDurationString(vidDuration),
              status: safeProgress >= 95 ? "completed" : "in-progress",
            },
          });
        }
      }

      if (captions.length > 0) {
        const cue = captions.find(
          (c, index) =>
            vidCurrentTime >= c.start &&
            (vidCurrentTime < c.end || (index === captions.length - 1 && vidCurrentTime === c.end)),
        );
        const targetText = cue ? cue.text : "";
        if (activeCaption !== targetText) setActiveCaption(targetText);
      }
    }
  };

  const handleTranscriptClick = (startTime) => {
    const v = videoRef.current;
    if (!v) return;
    const vidDuration = v.duration;
    v.currentTime = startTime;
    setCurrentTime(startTime);
    if (isFinite(vidDuration) && vidDuration > 0) setProgress((startTime / vidDuration) * 100);
    if (!isPlaying) {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => setIsPlaying(true)).catch(console.warn);
      } else {
        setIsPlaying(true);
      }
    }
  };

  const formatTime = (time) => {
    if (time === undefined || time === null || Object.is(time, NaN) || !isFinite(time))
      return "0:00";
    const minutes = Math.floor(Math.abs(time) / 60);
    const seconds = Math.floor(Math.abs(time) % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // ── Keyboard shortcuts — AFTER all functions are defined ──
  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.target.isContentEditable ||
        event.target.closest?.("button, a, summary, input, textarea, select")
      )
        return;
      // The transcript has its own keyboard handling; don't also trigger player shortcuts there.
      if (event.target.closest?.("[data-shortcuts-ignore]")) return;
      if (isCelebrityModalOpen || isFlashcardStudyOpen) return;

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;
        case "n":
          event.preventDefault();
          if (currentLessonIndex < allLessons.length - 1) handleNext();
          break;
        case "p":
          event.preventDefault();
          if (currentLessonIndex > 0) handlePrevious();
          break;
        case "m":
          event.preventDefault();
          toggleMute();
          break;
        case "f":
          event.preventDefault();
          toggleFullscreen();
          break;
        case "arrowright":
          event.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(
              videoRef.current.currentTime + 10,
              videoRef.current.duration || 0,
            );
          }
          break;
        case "arrowleft":
          event.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
          }
          break;
        case "arrowup":
          event.preventDefault();
          if (videoRef.current) {
            const newVol = Math.min(volume + 0.1, 1);
            setVolume(newVol);
            videoRef.current.volume = newVol;
          }
          break;
        case "arrowdown":
          event.preventDefault();
          if (videoRef.current) {
            const newVol = Math.max(volume - 0.1, 0);
            setVolume(newVol);
            videoRef.current.volume = newVol;
          }
          break;
        default:
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    isCelebrityModalOpen,
    isFlashcardStudyOpen,
    togglePlay,
    handleNext,
    handlePrevious,
    toggleMute,
    toggleFullscreen,
    currentLessonIndex,
    allLessons,
    volume,
  ]);

  // One measured workspace width controls both layout and Transcript mode.
  useEffect(() => {
    if (!learningData || !workspaceRef.current) return undefined;
    const update = (width) => {
      const narrow = width < 1080;
      setIsTranscriptDrawer(narrow);
      if (narrow && lastDrawerModeRef.current !== true) setIsTranscriptOpen(false);
      lastDrawerModeRef.current = narrow;
    };
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width));
      observer.observe(workspaceRef.current);
      return () => observer.disconnect();
    }
    const media = window.matchMedia?.("(max-width: 1279px)");
    if (!media) return undefined;
    const sync = () => update(media.matches ? 800 : 1200);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
    // Observe when the loading screen is replaced by the workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!learningData]);

  // Match the desktop transcript height to the video card only.
  useEffect(() => {
    const card = videoCardRef.current;
    const workspace = workspaceRef.current;
    if (!card || !workspace || typeof ResizeObserver === "undefined") return undefined;
    const syncHeight = () => {
      const height = card.getBoundingClientRect().height;
      workspace.style.setProperty("--lw-video-card-height", `${Math.round(height)}px`);
    };
    const observer = new ResizeObserver(syncHeight);
    syncHeight();
    observer.observe(card);
    return () => {
      observer.disconnect();
      workspace.style.removeProperty("--lw-video-card-height");
    };
  }, [isTranscriptDrawer, currentLesson?.id, aiVideoUrl]);

  // Loading state
  if (!learningData) {
    return <LoadingSpinner label={t("learning.loading")} />;
  }

  // The transcript is still loading while the video is generating, or while the saved script is
  // waiting for the video's duration to place its sentences.
  const isTranscriptLoading =
    isAIVideoLoading ||
    isTranscriptFetching ||
    (hasTranscriptText(generatedTextContent) && captions.length === 0);

  const closeTranscript = () => {
    setIsTranscriptOpen(false);
    transcriptToggleRef.current?.focus();
  };

  const currentModule = modules?.find((module) =>
    module.lessons?.some((lesson) => lesson.id === currentLesson?.id),
  );
  const completedCount = Math.min(
    currentCourseProgress?.completedLessons?.length || 0,
    allLessons.length,
  );
  const coursePercent = allLessons.length ? (completedCount / allLessons.length) * 100 : 0;
  return (
    <div className="lw-page">
      <div className="lw-inner" ref={workspaceRef}>
        <nav className="lw-breadcrumb" aria-label={t("learning.workspace.breadcrumb")}>
          <button type="button" aria-label={t("nav.dashboard")} onClick={() => navigate("/")}>
            <Home aria-hidden="true" />
          </button>
          <ChevronRight aria-hidden="true" />
          <button type="button" onClick={() => navigate("/courses")}>
            {t("learning.my_course")}
          </button>
          <ChevronRight aria-hidden="true" />
          <span>{currentModule?.title}</span>
        </nav>
        <header className="lw-heading">
          <span className="lw-eyebrow">
            {t("learning.workspace.lesson")} {Math.max(0, currentLessonIndex + 1)} /{" "}
            {allLessons.length}
          </span>
          <h1>{currentLesson?.title}</h1>
        </header>
        <LearningToolbar
          modules={modules}
          currentLesson={currentLesson}
          title={currentLesson?.title}
          moduleTitle={currentModule?.title}
          onLessonSelect={handleLessonClick}
          progress={coursePercent}
          completed={completedCount}
          total={allLessons.length}
          selectedVoice={selectedCelebrity}
          onVoiceOpen={() => setIsCelebrityModalOpen(true)}
          transcriptOpen={isTranscriptOpen}
          onTranscriptToggle={() => setIsTranscriptOpen((open) => !open)}
          transcriptRef={transcriptToggleRef}
          transcriptId={TRANSCRIPT_PANEL_ID}
        />
        <div className="lw-workspace" data-inspector={isTranscriptOpen && !isTranscriptDrawer}>
          <div className="lw-media-column">
            <div className="lw-video-card" ref={videoCardRef}>
              <VideoPlayer
                title={currentLesson?.title}
                moduleTitle={currentModule?.title}
                aiVideoUrl={aiVideoUrl}
                selectedCelebrity={selectedCelebrity}
                activeCaption={activeCaption}
                playerContainerRef={playerContainerRef}
                videoRef={videoRef}
                handleProgress={handleProgress}
                isAIVideoLoading={isAIVideoLoading}
                isPlaying={isPlaying}
                volume={volume}
                isMuted={isMuted}
                progress={progress}
                isFullscreen={isFullscreen}
                duration={duration}
                currentTime={currentTime}
                togglePlay={togglePlay}
                handleVolumeChange={handleVolumeChange}
                toggleMute={toggleMute}
                toggleFullscreen={toggleFullscreen}
                formatTime={formatTime}
                onCancelGeneration={cancelGeneration}
                onPlaybackChange={setIsPlaying}
                generationError={aiGenerationError}
                onRetryGeneration={handleRetryGeneration}
                playbackBlocked={isCelebrityModalOpen || isFlashcardStudyOpen}
              />
            </div>

            <LessonActions
              index={currentLessonIndex}
              total={allLessons.length}
              onPrevious={handlePrevious}
              onNext={handleNext}
              navigating={isNavigating}
              showFlashcards={isCurrentLessonCompleted}
              flashcardsDisabled={!generatedTextContent?.trim() || isAIVideoLoading}
              onFlashcards={() => setIsFlashcardStudyOpen(true)}
            />
            <details className="lw-shortcuts">
              <summary>{t("learning.workspace.shortcuts")}</summary>
              <div>
                {[
                  ["Space / K", t("learning.workspace.play_pause")],
                  ["N", t("learning.next")],
                  ["P", t("learning.previous")],
                  ["M", t("learning.workspace.mute")],
                  ["F", t("learning.workspace.fullscreen")],
                ].map(([key, label]) => (
                  <span key={key}>
                    <kbd>{key}</kbd>
                    {label}
                  </span>
                ))}
              </div>
            </details>
          </div>
          <AITranscript
            id={TRANSCRIPT_PANEL_ID}
            isDrawer={isTranscriptDrawer}
            isOpen={isTranscriptOpen}
            isLoading={isTranscriptLoading}
            error={transcriptError}
            onClose={closeTranscript}
            captions={captions}
            currentTime={currentTime}
            activeCaptionRef={activeCaptionRef}
            containerRef={transcriptContainerRef}
            onTranscriptClick={handleTranscriptClick}
            formatTime={formatTime}
          />
        </div>
      </div>
      {isCelebrityModalOpen && (
        <VoiceoverDialog
          voices={celebrities}
          selected={selectedCelebrity}
          onApply={(voice) => {
            if (!celebrities.includes(voice)) return;
            playRequestedRef.current = true;
            if (voice === selectedCelebrity) {
              if (aiVideoUrl && !isAIVideoLoading) setIsPlaying(true);
              else if (!isAIVideoLoading) handleRetryGeneration();
            } else setSelectedCelebrity(voice);
          }}
          onClose={() => setIsCelebrityModalOpen(false)}
        />
      )}
      <FlashcardStudy
        open={isFlashcardStudyOpen}
        onClose={() => setIsFlashcardStudyOpen(false)}
        courseId={courseId}
        lessonId={currentLesson?.id}
        lessonTitle={currentLesson?.title}
        transcript={generatedTextContent}
      />
    </div>
  );
}
