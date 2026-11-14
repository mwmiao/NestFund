'use client';

import './globals.css';

/** Last resort when the root layout itself fails (for example the database cannot be opened). Static, bilingual, no providers. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="pt-PT" className="dark">
      <body className="min-h-screen">
        <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Algo correu mal · Something went wrong</h1>
          <p className="muted mt-2 text-sm">Não foi possível carregar a aplicação. Os teus dados não foram afetados.</p>
          <p className="muted mt-1 text-sm">The app could not be loaded. Your data is not affected.</p>
          {error.digest && <p className="muted mt-2 text-xs">Ref: {error.digest}</p>}
          <button type="button" className="btn-primary mt-6" onClick={() => window.location.reload()}>
            Tentar outra vez · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
