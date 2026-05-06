"use client";

export function PartSpecCard({ title, specs }: { title: string; specs: Record<string, string | number | boolean> }) {
  return (
    <div className="panel p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">{title}</h3>
      <div className="grid gap-1 text-sm">
        {Object.entries(specs).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-2">
            <span className="text-labMuted">{key}</span>
            <span className="mono text-labText">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
