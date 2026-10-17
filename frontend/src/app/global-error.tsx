"use client";

import "./globals.css";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center p-6 text-center">
        <main>
          <title>ToolApp</title>
          <h1 className="text-2xl font-semibold">Algo salió mal · Something went wrong</h1>
          {error.digest && <p className="mt-2 text-sm text-muted-foreground">{error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            className="mt-6 rounded-md border px-4 py-2 text-sm font-medium"
          >
            Reintentar · Try again
          </button>
        </main>
      </body>
    </html>
  );
}
