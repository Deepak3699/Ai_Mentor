import SpeedMenu from "./SpeedMenu";
import CaptionsGlyph from "./CaptionsGlyph";
import GenerationFailure from "./GenerationFailure";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  LoaderCircle,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import "../learning/learning-workspace.css";

export default function VideoPlayer({
    title,
  moduleTitle,
aiVideoUrl,
  selectedCelebrity,
  activeCaption,
  playerContainerRef,
  videoRef,
  handleProgress,
  isAIVideoLoading,
  isPlaying,
  volume = 1,
  isMuted,
  progress,
  isFullscreen,
  duration,
  currentTime,
  togglePlay,
  handleVolumeChange,
  toggleMute,
  toggleFullscreen,
  formatTime,
  onEnded,
  onCancelGeneration,
  onPlaybackChange,
  generationError,
  onRetryGeneration,
  playbackBlocked = false,
}) {
  const { t } = useTranslation();
  const [media, setMedia] = useState({
    source: null,
    buffering: false,
    failed: false,
    buffered: 0,
  });
  const CAPTION_PREFERENCES_KEY = "ai-mentor-caption-preferences";
  const defaultCaptionPreferences={fontSize:100,fontFamily:"default",textColor:"#ffffff",backgroundOpacity:75};
  const [captions,setCaptions]=useState(true);
  const [captionPreferences,setCaptionPreferences]=useState(()=>{try{return {...defaultCaptionPreferences,...JSON.parse(localStorage.getItem(CAPTION_PREFERENCES_KEY)||"{}")} }catch{return defaultCaptionPreferences}});
  const [controls, setControls] = useState(true);
  const [rate, setRate] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(()=>{localStorage.setItem(CAPTION_PREFERENCES_KEY,JSON.stringify(captionPreferences))},[captionPreferences]);
  const captionFont={default:"inherit",sans:"Arial, Helvetica, sans-serif",serif:"Georgia, 'Times New Roman', serif",mono:"Consolas, 'Courier New', monospace"}[captionPreferences.fontFamily]||"inherit";
  const captionStyle={"--lw-caption-scale":captionPreferences.fontSize/100,"--lw-caption-font":captionFont,"--lw-caption-color":captionPreferences.textColor,"--lw-caption-background-opacity":captionPreferences.backgroundOpacity/100};
  const timer = useRef(null);
  const source = selectedCelebrity ? aiVideoUrl : null;
  const generating = !!isAIVideoLoading && !source;
  const failed = !!source && media.source === source && media.failed;
  const buffering = !!source && media.source === source && media.buffering && !failed;
  const showControls = controls || !isPlaying || buffering || settingsOpen;
  const position = Math.max(0, Math.min(100, progress || 0));
  const buffered = media.source === source ? Math.max(position, media.buffered) : position;
  const reveal = () => {
    setControls(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!settingsOpen && !playerContainerRef.current?.contains(document.activeElement)) {
        setControls(false);
      }
    }, 2500);
  };
  const updateMedia = (values) =>
    setMedia((previous) => ({
      ...(previous.source === source
        ? previous
        : { source, buffering: false, failed: false, buffered: 0 }),
      ...values,
    }));
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const video = videoRef?.current;
    if (!video || !source) return undefined;
    let active = true;
    if (isPlaying && !playbackBlocked && !generating) {
      video.play()?.catch((error) => {
        if (!active) return;
        console.warn("Playback unavailable:", error);
        onPlaybackChange?.(false);
      });
    } else video.pause();
    return () => {
      active = false;
    };
  }, [isPlaying, source, videoRef, onPlaybackChange, playbackBlocked, generating]);
  const seekTo = (seconds) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, seconds));
    handleProgress?.();
    reveal();
  };
  const syncBuffered = (event) => {
    const video = event.currentTarget;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime) end = video.buffered.end(i);
    }
    updateMedia({ buffered: Math.max(0, Math.min(100, (end / video.duration) * 100)) });
  };
  const control = (label, action, icon, extra = {}) => (
    <button type="button" aria-label={label} title={label} onClick={action} {...extra}>
      {icon}
    </button>
  );
  return (
    <div
      ref={playerContainerRef}
      className="lw-player"
      data-controls={showControls}
      data-playing={isPlaying ? "true" : "false"}
      data-settings-open={settingsOpen ? "true" : "false"}
      onPointerMove={reveal}
      onPointerDown={reveal}
      onMouseLeave={() => {
        if (isPlaying && !playerContainerRef.current?.contains(document.activeElement))
          setControls(false);
      }}
      onBlurCapture={reveal}
      onFocusCapture={() => {
        clearTimeout(timer.current);
        setControls(true);
      }}
    >
      <video
        ref={videoRef}
        src={source || undefined}
        preload="metadata"
        playsInline
        onClick={togglePlay}
        onLoadStart={() => updateMedia({ buffering: !!source, failed: false, buffered: 0 })}
        onEnded={(event) => {
          onPlaybackChange?.(false);
          onEnded?.(event);
        }}
        onPlay={() => {
          if (playbackBlocked || generating) videoRef.current?.pause();
          else onPlaybackChange?.(true);
        }}
        onPause={() => onPlaybackChange?.(false)}
        onTimeUpdate={handleProgress}
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = rate;
          handleProgress?.();
          syncBuffered(event);
        }}
        onProgress={syncBuffered}
        onWaiting={() => updateMedia({ buffering: true })}
        onCanPlay={() => updateMedia({ buffering: false })}
        onPlaying={() => updateMedia({ buffering: false })}
        onLoadedData={() => updateMedia({ buffering: false })}
        onError={() => {
          if (!source) return;
          updateMedia({ buffering: false, failed: true });
          onPlaybackChange?.(false);
        }}
      />
      <GenerationFailure error={generationError} onRetry={onRetryGeneration} />
      {(title || moduleTitle) && !generating && !failed && (
        <div className="lw-player-title" aria-hidden="true">
          {title && <strong>{title}</strong>}
          {moduleTitle && <span>{moduleTitle}</span>}
        </div>
      )}
      {(!source || !isPlaying) && !generating && !failed && !buffering && !generationError && (
        <div className={`lw-player-idle ${source ? "lw-player-idle--paused" : ""}`}>
          <button
            type="button"
            className="lw-play-button"
            onClick={togglePlay}
            aria-label={t("learning.workspace.play")}
            title={t("learning.workspace.play")}
          >
            <Play size={30} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      )}
      {failed && (
        <div className="lw-player-placeholder" role="alert">
          <p>{t("learning.workspace.video_error")}</p>
          <button
            type="button"
            className="lw-player-retry"
            onClick={() => {
              updateMedia({ failed: false, buffering: true });
              videoRef.current?.load();
            }}
          >
            {t("learning.workspace.retry")}
          </button>
        </div>
      )}
      {(generating || buffering) && (
        <div className="lw-player-loading" role="status">
          <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" size={25} />
          <p>{t(generating ? "learning.workspace.generating" : "learning.player.loading_video")}</p>
          {generating && onCancelGeneration && (
            <button type="button" className="lw-cancel-generation" onClick={onCancelGeneration}>
              {t("learning.workspace.cancel_generation")}
            </button>
          )}
        </div>
      )}
      {activeCaption && captions && !generating && !failed && (
        <div className="lw-player-caption" style={captionStyle}>{activeCaption}</div>
      )}
      {!!source && !failed && (
        <div
          className="lw-player-controls"
          style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none" }}
        >
          <input
            type="range"
            className="lw-seek"
            min={0}
            max={100}
            step={0.1}
            value={position}
            style={{ "--lw-position": `${position}%`, "--lw-buffered": `${buffered}%` }}
            aria-label={t("learning.workspace.seek")}
            aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
            onChange={(event) =>
              seekTo((Number(event.target.value) / 100) * (videoRef.current?.duration || 0))
            }
            data-shortcuts-ignore
          />
          <div className="lw-player-bottom">
            <div className="lw-player-left">
              {control(
                t(isPlaying ? "learning.workspace.pause" : "learning.workspace.play_pause"),
                togglePlay,
                isPlaying ? <Pause size={20} /> : <Play size={20} />,
              )}
              {control(
                t("learning.player.rewind"),
                () => seekTo((videoRef.current?.currentTime || 0) - 10),
                <RotateCcw size={18} />,
                { className: "lw-skip" },
              )}
              {control(
                t("learning.player.forward"),
                () => seekTo((videoRef.current?.currentTime || 0) + 10),
                <RotateCw size={18} />,
                { className: "lw-skip" },
              )}
              <div className="lw-player-audio">
                {control(
                  t(isMuted ? "learning.workspace.unmute" : "learning.workspace.mute"),
                  toggleMute,
                  isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />,
                  { "aria-pressed": !!isMuted },
                )}
                <input
                  type="range"
                  className="lw-player-volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  style={{ "--lw-position": `${(isMuted ? 0 : volume) * 100}%` }}
                  onChange={handleVolumeChange}
                  aria-label={t("learning.workspace.volume")}
                  data-shortcuts-ignore
                />
              </div>
              <span className="lw-player-time">
                {formatTime(currentTime)} <span>/ {formatTime(duration)}</span>
              </span>
            </div>
            <div className="lw-player-right">
              <SpeedMenu
                value={rate}
                containerRef={playerContainerRef}
                onOpenChange={(open) => {
                  setSettingsOpen(open);
                  if (open) reveal();
                }}
                captionsEnabled={captions}
                onCaptionsChange={setCaptions}
                captionLanguage="English"
                audioLanguage="English"
                captionPreferences={captionPreferences}
                onCaptionPreferencesChange={setCaptionPreferences}
                onChange={(next) => {
                  setRate(next);
                  if (videoRef.current) videoRef.current.playbackRate = next;
                }}
              />
              {control(
                t("learning.workspace.captions"),
                () => setCaptions((value) => !value),
                <CaptionsGlyph active={captions} />,
                { "aria-pressed": captions, className: "lw-captions-toggle" },
              )}
              {control(
                t(
                  isFullscreen
                    ? "learning.workspace.exit_fullscreen"
                    : "learning.workspace.fullscreen",
                ),
                toggleFullscreen,
                isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />,
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
