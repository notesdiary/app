export function AppIcon({ size = 30 }: { size?: number }) {
  const cornerRadiusRatio = 8 / 30; // From mock proportions
  const cornerRadius = size * cornerRadiusRatio;

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: '#081A59',
        borderRadius: cornerRadius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        viewBox="0 0 20 20"
        width={size * (20 / 30)} // Scale the inner glyph proportionally
        height={size * (20 / 30)}
        style={{ flexShrink: 0 }}
      >
        {/* Notebook page outline */}
        <rect
          x="3"
          y="1.5"
          width="14"
          height="17"
          rx="2"
          fill="none"
          stroke="#D9FAFF"
          strokeWidth="1.2"
        />

        {/* Spiral binding: 5 rings punched through the left edge of the page */}
        <circle cx="3" cy="3.5" r="1.3" fill="#081A59" stroke="#D9FAFF" strokeWidth="1.1" />
        <circle cx="3" cy="6.5" r="1.3" fill="#081A59" stroke="#D9FAFF" strokeWidth="1.1" />
        <circle cx="3" cy="9.5" r="1.3" fill="#081A59" stroke="#D9FAFF" strokeWidth="1.1" />
        <circle cx="3" cy="12.5" r="1.3" fill="#081A59" stroke="#D9FAFF" strokeWidth="1.1" />
        <circle cx="3" cy="15.5" r="1.3" fill="#081A59" stroke="#D9FAFF" strokeWidth="1.1" />

        {/* Ruled text lines on the page */}
        <line x1="7" y1="6.5" x2="14" y2="6.5" stroke="#D9FAFF" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="7" y1="9.5" x2="14" y2="9.5" stroke="#D9FAFF" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="7" y1="12.5" x2="12" y2="12.5" stroke="#D9FAFF" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
