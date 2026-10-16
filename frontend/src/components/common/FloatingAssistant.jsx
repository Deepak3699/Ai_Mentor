import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  GripHorizontal,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const ANCHOR_KEY = "floatingAssistantAnchor";
const EDGE_GAP = 16;
const LAUNCHER_SIZE = 52;
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 500;
const MIN_WIDTH = 320;
const MAX_WIDTH = 520;
const MIN_HEIGHT = 360;
const MOBILE_BREAKPOINT = 640;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const defaultAnchor = () => ({
  x: window.innerWidth - 28,
  y: window.innerHeight - 28,
});

const constrainAnchor = (anchor) => ({
  x: clamp(anchor.x, EDGE_GAP + LAUNCHER_SIZE, window.innerWidth - EDGE_GAP),
  y: clamp(anchor.y, EDGE_GAP + LAUNCHER_SIZE, window.innerHeight - EDGE_GAP),
});

const FloatingAssistant = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
  });
  const [anchor, setAnchor] = useState(() => {
    if (typeof window === "undefined") return { x: 80, y: 80 };
    try {
      const stored = JSON.parse(localStorage.getItem(ANCHOR_KEY));
      if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) {
        return constrainAnchor(stored);
      }
    } catch {
      // Ignore invalid persisted assistant layout data.
    }
    return defaultAnchor();
  });
  const [messages, setMessages] = useState([
    {
      sender: "assistant",
      text: "Hello! I’m your AI Mentor Assistant. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const dragState = useRef({ offsetX: 0, offsetY: 0, moved: false });
  const resizeState = useRef({
    startWidth: 0,
    startHeight: 0,
    startX: 0,
    startY: 0,
  });
  const suppressClick = useRef(false);

  const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;
  const displayedHeight = isMinimized ? 64 : dimensions.height;
  const panelLeft = clamp(
    anchor.x - dimensions.width,
    EDGE_GAP,
    window.innerWidth - dimensions.width - EDGE_GAP,
  );
  const panelTop = clamp(
    anchor.y - displayedHeight,
    EDGE_GAP,
    window.innerHeight - displayedHeight - EDGE_GAP,
  );

  const saveAnchor = (nextAnchor) => {
    const constrained = constrainAnchor(nextAnchor);
    localStorage.setItem(ANCHOR_KEY, JSON.stringify(constrained));
    return constrained;
  };

  const resetAssistant = () => {
    setDimensions({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
    setAnchor(saveAnchor(defaultAnchor()));
    setIsMinimized(false);
  };

  const handleToggle = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setIsOpen((previous) => !previous);
    setIsMinimized(false);
  };

  const sendMessage = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setMessages((previous) => [...previous, { sender: "user", text: message }]);
    setInput("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      const { data } = await axios.post(
        "/api/assistant/chat",
        { message },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMessages((previous) => [
        ...previous,
        {
          sender: "assistant",
          text: typeof data.reply === "string" ? data.reply : JSON.stringify(data.reply),
          route: data.route || null,
          lessonId: data.lessonId || null,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          sender: "assistant",
          text: error?.response?.data?.message || "Sorry, something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const beginDrag = (event, left, top, { allowButton = false } = {}) => {
    if (event.button !== 0 || (!allowButton && event.target.closest("button"))) return;
    event.preventDefault();
    dragState.current = {
      offsetX: event.clientX - left,
      offsetY: event.clientY - top,
      moved: false,
    };
    suppressClick.current = false;
    setIsDragging(true);
  };

  const beginLauncherDrag = (event) => {
    beginDrag(event, anchor.x - LAUNCHER_SIZE, anchor.y - LAUNCHER_SIZE, { allowButton: true });
  };

  const beginPanelDrag = (event) => {
    if (isMobile()) return;
    beginDrag(event, panelLeft, panelTop);
  };

  const beginResize = (event) => {
    if (isMobile() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState.current = {
      startWidth: dimensions.width,
      startHeight: dimensions.height,
      startX: event.clientX,
      startY: event.clientY,
    };
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMove = (event) => {
      if (isDragging) {
        const itemWidth = isOpen ? dimensions.width : LAUNCHER_SIZE;
        const itemHeight = isOpen ? displayedHeight : LAUNCHER_SIZE;
        const left = clamp(
          event.clientX - dragState.current.offsetX,
          EDGE_GAP,
          window.innerWidth - itemWidth - EDGE_GAP,
        );
        const top = clamp(
          event.clientY - dragState.current.offsetY,
          EDGE_GAP,
          window.innerHeight - itemHeight - EDGE_GAP,
        );
        if (
          Math.abs(left + itemWidth - anchor.x) > 3 ||
          Math.abs(top + itemHeight - anchor.y) > 3
        ) {
          dragState.current.moved = true;
        }
        setAnchor({ x: left + itemWidth, y: top + itemHeight });
      }

      if (isResizing) {
        const width = clamp(
          resizeState.current.startWidth - (event.clientX - resizeState.current.startX),
          MIN_WIDTH,
          Math.min(MAX_WIDTH, window.innerWidth - EDGE_GAP * 2),
        );
        const height = clamp(
          resizeState.current.startHeight - (event.clientY - resizeState.current.startY),
          MIN_HEIGHT,
          window.innerHeight - EDGE_GAP * 2,
        );
        setDimensions({ width, height });
      }
    };

    const handleUp = () => {
      if (isDragging) {
        suppressClick.current = dragState.current.moved;
        setAnchor((current) => saveAnchor(current));
      }
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    }
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [anchor.x, anchor.y, dimensions, displayedHeight, isDragging, isOpen, isResizing]);

  useEffect(() => {
    const handleViewportResize = () => {
      setAnchor((current) => saveAnchor(current));
      setDimensions((current) => ({
        width: Math.min(current.width, window.innerWidth - EDGE_GAP * 2),
        height: Math.min(current.height, window.innerHeight - EDGE_GAP * 2),
      }));
    };
    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const launcherStyle = {
    left: `${anchor.x - LAUNCHER_SIZE}px`,
    top: `${anchor.y - LAUNCHER_SIZE}px`,
  };
  const panelStyle = {
    left: `${panelLeft}px`,
    top: `${panelTop}px`,
    width: `${dimensions.width}px`,
    height: `${displayedHeight}px`,
  };

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          onPointerDown={beginLauncherDrag}
          onClick={handleToggle}
          style={launcherStyle}
          className={`group fixed z-[141] flex h-[52px] w-[52px] touch-none items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br from-[#4B79E8] via-[#3867D6] to-[#254FB4] text-white shadow-xl shadow-[#3867D6]/25 ring-2 ring-canvas transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[#3867D6]/45 focus:outline-none focus:ring-[#3867D6]/25 ${
            isDragging ? "cursor-grabbing scale-105" : "cursor-grab"
          }`}
          aria-label="Drag or open AI Mentor Assistant"
          title="Drag to move · Click to open"
        >
          <span className="absolute inset-1 rounded-lg bg-white/[0.06]" />
          <Bot className="relative h-6 w-6 transition-transform group-hover:scale-105" />
          <Sparkles className="absolute right-1 top-1 h-3 w-3 text-blue-100" />
          <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full border border-[#3867D6] bg-emerald-400" />
        </button>
      ) : (
        <section
          style={panelStyle}
          className={`fixed z-[140] flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-main shadow-2xl ring-1 ring-black/5 transition-[height] duration-200 max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:h-[min(72dvh,580px)] max-sm:w-auto max-sm:max-w-none ${
            isDragging ? "select-none" : ""
          }`}
          aria-label="AI Mentor Assistant"
        >
          <header
            onPointerDown={beginPanelDrag}
            className="flex h-16 shrink-0 cursor-grab items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#315BC0] to-[#3867D6] px-4 text-white active:cursor-grabbing max-sm:cursor-default"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <Bot className="h-5 w-5" />
                <Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-blue-100" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-extrabold">AI Mentor Assistant</h2>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Ready to help
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <GripHorizontal className="mr-1 hidden h-4 w-4 text-white/55 sm:block" />
              <button
                type="button"
                onClick={resetAssistant}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/15 hover:text-white sm:flex"
                aria-label="Reset assistant position"
                title="Reset position"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized((previous) => !previous)}
                className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/15 hover:text-white sm:flex"
                aria-label={isMinimized ? "Restore assistant" : "Minimize assistant"}
              >
                {isMinimized ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggle}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/75 transition hover:bg-white/15 hover:text-white"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {!isMinimized && (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-canvas px-4 py-5 scrollbar-hide">
                <div className="mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-[#3867D6]" />
                  Ask about courses, progress, or navigation
                </div>

                {messages.map((message, index) => (
                  <div
                    key={`${message.sender}-${index}`}
                    className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.sender === "user"
                          ? "rounded-br-md bg-[#3867D6] text-white"
                          : "rounded-bl-md border border-border bg-card text-main"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      {message.route && (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(message.route, { state: { lessonId: message.lessonId } })
                          }
                          className="mt-3 rounded-lg bg-[#3867D6] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#315BC0]"
                        >
                          {message.lessonId ? "Resume Lesson" : "Go to page"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3867D6]"
                          style={{ animationDelay: `${dot * 120}ms` }}
                        />
                      ))}
                      <span className="ml-1 text-xs text-muted">Assistant is typing</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="shrink-0 border-t border-border bg-card p-3">
                <div className="flex items-end gap-2 rounded-xl border border-border bg-canvas-alt p-2 transition focus-within:border-[#3867D6] focus-within:ring-4 focus-within:ring-[#3867D6]/10">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Ask me anything..."
                    className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-main outline-none placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3867D6] text-white transition hover:bg-[#315BC0] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] text-muted">
                  Enter to send · Shift+Enter for a new line
                </p>
              </footer>

              <button
                type="button"
                onPointerDown={beginResize}
                className="absolute left-0 top-0 hidden h-5 w-5 cursor-nwse-resize sm:block"
                aria-label="Resize assistant"
                title="Drag to resize"
              />
            </>
          )}
        </section>
      )}
    </>
  );
};

export default FloatingAssistant;
