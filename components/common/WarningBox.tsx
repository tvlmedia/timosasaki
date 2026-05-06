"use client";

export function WarningBox({ title, lines }: { title?: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="rounded-2xl border border-labWarning/50 bg-[#221c0f] p-4 text-sm text-labWarning">
      {title && <p className="mb-2 font-semibold text-[#ffd787]">{title}</p>}
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
