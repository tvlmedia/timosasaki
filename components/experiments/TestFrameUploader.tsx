"use client";

import { createId } from "@/lib/ids";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import type { TestImage } from "@/types";

const suggestedLabels = ["T2 chart", "T2.8 chart", "flare test", "bokeh test", "face on thirds", "real-world shot"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function TestFrameUploader({
  images,
  onChange
}: {
  images: TestImage[];
  onChange: (next: TestImage[]) => void;
}) {
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const loaded = await Promise.all(
      Array.from(files).map(async (file, index) => ({
        id: createId("img"),
        label: suggestedLabels[index % suggestedLabels.length] ?? file.name,
        dataUrl: await readFileAsDataUrl(file),
        notes: ""
      }))
    );
    onChange([...images, ...loaded]);
  };

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1 text-sm text-labMuted">
        <span>Images upload</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            void addFiles(event.target.files);
          }}
          className="rounded-xl border border-labBorder bg-[#090909] p-2"
        />
      </label>
      <p className="text-xs text-labWarning">Warning: large image uploads can fill localStorage quickly.</p>
      <div className="space-y-2">
        {images.map((image) => (
          <div key={image.id} className="rounded-xl border border-labBorder bg-[#0a0a0a] p-2">
            <div className="mb-2 flex gap-2">
              <img src={image.dataUrl} alt={image.label} className="h-16 w-24 rounded-md border border-labBorder object-cover" />
              <div className="flex-1 space-y-2">
                <Input
                  label="Label"
                  value={image.label}
                  onChange={(event) =>
                    onChange(images.map((entry) => (entry.id === image.id ? { ...entry, label: event.target.value } : entry)))
                  }
                />
                <Input
                  label="Notes"
                  value={image.notes ?? ""}
                  onChange={(event) =>
                    onChange(images.map((entry) => (entry.id === image.id ? { ...entry, notes: event.target.value } : entry)))
                  }
                />
              </div>
            </div>
            <Button variant="danger" onClick={() => onChange(images.filter((entry) => entry.id !== image.id))}>
              Delete
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
