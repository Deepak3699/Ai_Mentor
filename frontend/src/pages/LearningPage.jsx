import API_BASE_URL, { apiFetch as fetch } from "../lib/api";
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
const STUDY_SESSION_BATCH_SECONDS = 30;

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
  const lastStudyVideoTimeRef = useRef(null);
  const lastStudyUpdateAtRef = useRef(null);
  const pendingStudySecondsRef = useRef(0);
  const failedBatchSecondsRef = useRef(0);
  const isFlushingRef = useRef(false);
  const generationRequestIdRef = useRef(0);
  const generationResumeRef = useRef(null);
  const playRequestedRef = useRef(false);
  const userRef = useRef(user);

  userRef.current = user;

  const flushStudySession = useCallback(async (force = false) => {
    if (isFlushingRef.current) return;

    const totalSecondsToFlush = pendingStudySecondsRef.current + failedBatchSecondsRef.current;

    if (!force && totalSecondsToFlush < STUDY_SESSION_BATCH_SECONDS) return;
    if (totalSecondsToFlush <= 0) return;

    const token = localStorage.getItem("token");
    if (!user?.id || !token) return;

    isFlushingRef.current = true;
    const batchToSubmit = totalSecondsToFlush;

    try {
      const response = await window.fetch(`${API_BASE_URL.replace(/\/$/, "")}/api/analytics/study-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          hours: batchToSubmit / 3600,
          chunkId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }),
      });

      if (response.ok) {
        pendingStudySecondsRef.current = Math.max(0, pendingStudySecondsRef.current - batchToSubmit);
        failedBatchSecondsRef.current = 0;
      } else {
        failedBatchSecondsRef.current = batchToSubmit;
      }
    } catch {
      failedBatchSecondsRef.current = batchToSubmit;
    } finally {
      isFlushingRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const seconds = pendingStudySecondsRef.current + failedBatchSecondsRef.current;
        if (seconds > 0 && user?.id) {
          const token = localStorage.getItem("token");
          const payload = JSON.stringify({ hours: seconds / 3600, beacon: true });
          if (navigator.sendBeacon) {
            navigator.sendBeacon(
              `${API_BASE_URL.replace(/\/$/, "")}/api/analytics/study-session`,
              new Blob([payload], { type: "application/json" })
            );
          }
        }
      }
    };

    const handlePageHide = () => {
      void flushStudySession(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      void flushStudySession(true);
    };
  }, [flushStudySession, user?.id]);

  const handlePlaybackChange = useCallback((playing) => {
    if (playing) {
      lastStudyVideoTimeRef.current = videoRef.current?.currentTime ?? null;
      lastStudyUpdateAtRef.current = Date.now();
    } else {
      void flushStudySession(true);
      lastStudyVideoTimeRef.current = null;
      lastStudyUpdateAtRef.current = null;
    }
    setIsPlaying(playing);
  }, [flushStudySession]);

  const handleProgress = (event) => {
    if (videoRef.current) {
      const video = videoRef.current;
      const vidDuration = video.duration;
      const vidCurrentTime = video.currentTime;

      if (event?.type === "timeupdate") {
        const previousTime = lastStudyVideoTimeRef.current;
        const previousUpdateAt = lastStudyUpdateAtRef.current;
        const elapsedVideo = vidCurrentTime - previousTime;
        const elapsedWall = (Date.now() - previousUpdateAt) / 1000;
        const playbackRate = video.playbackRate || 1;

        const isSeekingOrScrubbing = Math.abs(elapsedVideo - (elapsedWall * playbackRate)) > 2 || elapsedVideo < 0;

        if (
          isPlaying &&
          !video.paused &&
          !video.seeking &&
          !isSeekingOrScrubbing &&
          Number.isFinite(previousTime) &&
          Number.isFinite(previousUpdateAt) &&
          elapsedVideo > 0 &&
          elapsedWall > 0
        ) {
          const validDelta = Math.min(elapsedWall * playbackRate, 5);
          pendingStudySecondsRef.current += validDelta;
          void flushStudySession(false);
        }
        lastStudyVideoTimeRef.current = vidCurrentTime;
        lastStudyUpdateAtRef.current = Date.now();
      }

      if (isFinite(vidDuration) && vidDuration > 0) setDuration(vidDuration);
      setCurrentTime(vidCurrentTime);
      const currentProgressPercent = vidDuration > 0 ? (vidCurrentTime / vidDuration) * 100 : 0;
      setProgress(currentProgressPercent);

      const active = captions.find(
        (cue) => vidCurrentTime >= cue.start && vidCurrentTime <= cue.end,
      );
      setActiveCaption(active ? active.text : "");
    }
  };

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
  }, [courseId]);

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

    const controller = new AbortController();
    const { signal } = controller;
    const isStale = () => signal.aborted || requestId !== generationRequestIdRef.current;
    let finished = false;

    const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

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
        if (!isStale()) setIsAIVideoLoading(false);
      }
    };

    loadVideo();
    return () => {
      generationRequestIdRef.current += 1;
      if (!finished) {
        lastLessonIdRef.current = null;
        lastCelebrityRef.current = null;
      }
      controller.abort();
    };
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
          video.currentTime = isAlmostFinished ? 0 : jumpToTimeRef.current;
          jumpToTimeRef.current = null;
        }
      };
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
    }

    return () => {
      events.forEach((event) => document.removeEventListener(event, handleFullscreenChange));
    };
  }, []);

  return (
    <div className="learning-container" ref={workspaceRef}>
      <div className="breadcrumb">
        <Home size={16} /> <ChevronRight size={14} /> <span>Learning</span>
      </div>

      <LearningToolbar
        onOpenCelebrityModal={() => setIsCelebrityModalOpen(true)}
        onOpenFlashcards={() => setIsFlashcardStudyOpen(true)}
      />

      <div className="player-wrapper" ref={playerContainerRef}>
        <VideoPlayer
          ref={videoRef}
          src={aiVideoUrl}
          videoRef={videoRef}
          isPlaying={isPlaying}
          onPlaybackChange={handlePlaybackChange}
          onTimeUpdate={handleProgress}
          onEnded={() => void flushStudySession(true)}
          isMuted={isMuted}
        />
      </div>

      <div ref={transcriptContainerRef} id={TRANSCRIPT_PANEL_ID} className="transcript-panel">
        <p ref={activeCaptionRef}>{activeCaption || "Welcome to the lesson."}</p>
      </div>

      <VoiceoverDialog
        isOpen={isCelebrityModalOpen}
        onClose={() => setIsCelebrityModalOpen(false)}
        celebrities={celebrities}
        selectedCelebrity={selectedCelebrity}
        onSelectCelebrity={(celebrity) => {
          setSelectedCelebrity(celebrity);
          setIsCelebrityModalOpen(false);
        }}
      />

      {isFlashcardStudyOpen && (
        <FlashcardStudy
          isOpen={isFlashcardStudyOpen}
          onClose={() => setIsFlashcardStudyOpen(false)}
          lessonId={learningData?.currentLesson?.id}
        />
      )}

      <LessonActions />
    </div>
  );
}
