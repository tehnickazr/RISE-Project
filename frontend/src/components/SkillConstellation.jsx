import "../SkillConstellation.css";

export default function SkillConstellation({ isActive = false }) {
  return (
    <div
      className={`skill-constellation ${isActive ? "active" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 220 64" width="220" height="64">
        <defs>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c9cff" stopOpacity="0" />
            <stop offset="50%" stopColor="#7c9cff" stopOpacity="1" />
            <stop offset="100%" stopColor="#7c9cff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Base lines */}
        <g className="constellation-lines">
          <line x1="24" y1="34" x2="68" y2="18" />
          <line x1="68" y1="18" x2="112" y2="34" />
          <line x1="112" y1="34" x2="156" y2="16" />
          <line x1="112" y1="34" x2="158" y2="50" />
          <line x1="158" y1="50" x2="198" y2="30" />
          <line x1="156" y1="16" x2="198" y2="30" />
        </g>

        {/* Animated energy lines */}
        <g className="energy-lines">
          <line x1="24" y1="34" x2="68" y2="18" />
          <line x1="68" y1="18" x2="112" y2="34" />
          <line x1="112" y1="34" x2="156" y2="16" />
          <line x1="112" y1="34" x2="158" y2="50" />
          <line x1="158" y1="50" x2="198" y2="30" />
          <line x1="156" y1="16" x2="198" y2="30" />
        </g>

        {/* Nodes */}
        <g className="constellation-nodes" filter="url(#softGlow)">
          <circle cx="24" cy="34" r="5" />
          <circle cx="68" cy="18" r="5" />
          <circle cx="112" cy="34" r="6" />
          <circle cx="156" cy="16" r="5" />
          <circle cx="158" cy="50" r="5" />
          <circle cx="198" cy="30" r="6" />
        </g>

        {/* Traveling pulse */}
        <circle className="traveler" r="4" />
      </svg>
    </div>
  );
}
