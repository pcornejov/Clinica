import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const entrada =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100";

type Comun = { etiqueta: string; error?: string; ayuda?: string; className?: string };

function Pie({ error, ayuda }: Pick<Comun, "error" | "ayuda">) {
  return (
    <>
      {ayuda && !error && <span className="mt-1 block text-xs text-slate-400">{ayuda}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  className = "",
  ...input
}: Comun & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <input {...input} className={entrada} />
      <Pie error={error} ayuda={ayuda} />
    </label>
  );
}

export function CampoTexto({
  etiqueta,
  error,
  ayuda,
  className = "",
  ...area
}: Comun & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <textarea rows={3} {...area} className={entrada} />
      <Pie error={error} ayuda={ayuda} />
    </label>
  );
}

export function CampoSelect({
  etiqueta,
  error,
  ayuda,
  className = "",
  children,
  ...select
}: Comun & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{etiqueta}</span>
      <select {...select} className={entrada}>
        {children}
      </select>
      <Pie error={error} ayuda={ayuda} />
    </label>
  );
}

export function Casilla({
  etiqueta,
  className = "",
  ...input
}: { etiqueta: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`flex items-center gap-2 text-sm text-slate-700 ${className}`}>
      <input type="checkbox" {...input} className="h-4 w-4 rounded border-slate-300 accent-marca-600" />
      {etiqueta}
    </label>
  );
}

const botones = {
  primario: "bg-marca-600 text-white hover:bg-marca-700",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  peligro: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: { variante?: keyof typeof botones } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${botones[variante]} ${className}`}
    />
  );
}

export function Aviso({ tipo, children }: { tipo: "ok" | "error"; children: ReactNode }) {
  const estilo = tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700";
  return <p className={`rounded-lg px-3 py-2 text-sm ${estilo}`}>{children}</p>;
}

export function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      {descripcion && <p className="mt-1 text-sm text-slate-500">{descripcion}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Forma común del resultado de una acción de formulario. */
export type ResultadoAccion = {
  seccion: string;
  ok?: string;
  error?: string;
  errores?: Record<string, string>;
};
