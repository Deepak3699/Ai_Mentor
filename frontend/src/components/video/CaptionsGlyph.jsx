export default function CaptionsGlyph({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="3"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M10 9H7v6h3M17 9h-3v6h3"
        fill="none"
        stroke={active ? "#111318" : "currentColor"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
