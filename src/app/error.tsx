'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Não foi possível abrir esta página.</h1>
      <p>Confira a conexão e tente novamente. Seus registros salvos permanecem no Supabase.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
