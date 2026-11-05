export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-logo ${compact ? 'brand-compact' : ''}`}
      role="img"
      aria-label="Level01"
    >
      <img
        className="brand-on-light"
        src="/brand/level01-black.png"
        width="1312"
        height="1199"
        alt=""
      />
      <img
        className="brand-on-dark"
        src="/brand/level01-white.png"
        width="1312"
        height="1199"
        alt=""
      />
    </span>
  );
}
