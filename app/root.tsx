import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let titulo = "Ocurrió un error";
  let detalle = "Algo salió mal. Intenta nuevamente en unos minutos.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    titulo = error.status === 404 ? "Página no encontrada" : `Error ${error.status}`;
    // Si la ruta dio un motivo (p. ej. "Enlace no válido"), se muestra ese.
    const motivo = typeof error.data === "string" && error.data.length < 200 ? error.data : null;
    detalle = motivo ?? (error.status === 404 ? "La página que buscas no existe." : error.statusText || detalle);
  } else if (import.meta.env.DEV && error instanceof Error) {
    detalle = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">{titulo}</h1>
      <p className="mt-4 text-slate-600">{detalle}</p>
      <a href="/" className="mt-8 inline-block text-marca-700 underline">
        Volver al inicio
      </a>
      {stack && (
        <pre className="mt-8 overflow-x-auto rounded bg-slate-900 p-4 text-left text-xs text-slate-100">
          {stack}
        </pre>
      )}
    </main>
  );
}
