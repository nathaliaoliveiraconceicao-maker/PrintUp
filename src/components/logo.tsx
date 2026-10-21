/** Marca do PrintUp: camadas de uma peça impressa subindo, em um selo grafite. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1c1f24" />
      <rect x="7" y="21" width="18" height="4" rx="2" fill="#f26a1b" />
      <rect x="9.5" y="15.5" width="13" height="4" rx="2" fill="#f26a1b" opacity=".8" />
      <path d="M16 6.5 21.5 13.5h-11z" fill="#f26a1b" opacity=".6" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-lg font-bold tracking-tight ${className}`}>
      <LogoMark />
      <span>Print<span className="text-accent-strong">Up</span></span>
    </span>
  );
}
