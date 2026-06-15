import React from "react";

/**
 * VeloxSpace logo mark — a rounded square badge containing "V" and "S"
 * with a yellow lightning-bolt accent running between them.
 * Pass `animate` to make the bolt + letters glow/pulse (used for loading states).
 */
export function VeloxMark({ size = 32, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" className={animate ? "velox-mark-animate" : ""}>
      <defs>
        <linearGradient id="vsBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <filter id="boltGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="40" height="40" rx="10" fill="url(#vsBg)" />

      {/* V */}
      <path d="M7 10 L13 26 L16 26 L22 10 L18.4 10 L14.5 21 L10.6 10 Z" fill="#fff" opacity="0.92" />
      {/* S */}
      <path d="M33 13.5 C33 10.5 30.5 9 27.5 9 C24.5 9 22.5 10.8 22.5 13.2 C22.5 16 25 17 27.5 17.6 C30 18.2 31 18.8 31 20.3 C31 21.8 29.5 22.7 27.5 22.7 C25.3 22.7 23.7 21.6 23.3 19.7 L20.5 20.4 C21.1 23.6 23.8 25.5 27.5 25.5 C31.2 25.5 34 23.5 34 20.1 C34 17.1 31.6 16 28.7 15.3 C26.2 14.7 25.4 14.1 25.4 12.9 C25.4 11.6 26.7 10.8 28 10.8 C29.7 10.8 30.9 11.6 31.3 13.2 Z" fill="#fff" opacity="0.92" transform="translate(-1,0)" />

      {/* Lightning bolt accent through the middle */}
      <path
        className="velox-bolt"
        d="M21 6 L13 20 L18 20 L16 34 L26 18 L21 18 Z"
        fill="#fde047"
        filter="url(#boltGlow)"
      />
    </svg>
  );
}

/** Inline wordmark — "Velox" + gradient "Space", V and S accented yellow */
export function VeloxWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold ${className}`}>
      <span style={{ color: "#fde047" }}>V</span>elox
      <span className="gradient-text"><span style={{ color: "#fde047" }}>S</span>pace</span>
    </span>
  );
}