import Link from "next/link";

import "./globals.css";

export default function RootNotFound() {
  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center p-6 text-center">
        <main>
          <h1 className="text-2xl font-semibold">404</h1>
          <p className="mt-2 text-muted-foreground">Página no encontrada · Page not found</p>
          <Link href="/" className="mt-6 inline-block underline underline-offset-4">
            ToolApp
          </Link>
        </main>
      </body>
    </html>
  );
}
