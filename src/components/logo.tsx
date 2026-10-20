export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-semibold tracking-tight ${className}`}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        {/* camadas empilhadas de uma peça impressa */}
        <rect x="4" y="19" width="20" height="5" rx="2" fill="#d94e1b" />
        <rect x="6" y="12.5" width="16" height="5" rx="2" fill="#d94e1b" opacity=".75" />
        <rect x="8" y="6" width="12" height="5" rx="2" fill="#d94e1b" opacity=".5" />
      </svg>
      PrintUp
    </span>
  );
}
