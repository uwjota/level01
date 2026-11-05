export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-label="Carregando página">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div className="skeleton skeleton-content" />
      <span className="sr-only">Carregando página…</span>
    </div>
  );
}
