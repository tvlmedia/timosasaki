"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";

export function ScadCodeViewer({
  code,
  onDownload
}: {
  code: string;
  onDownload: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-labMuted">OpenSCAD Code</h3>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onCopy}>
            {copied ? "Copied" : "Copy OpenSCAD"}
          </Button>
          <Button onClick={onDownload}>Download .scad</Button>
        </div>
      </div>
      <textarea
        className="mono h-[480px] w-full resize-y rounded-xl border border-labBorder bg-[#060606] p-3 text-xs text-labText outline-none"
        value={code}
        readOnly
      />
    </div>
  );
}
