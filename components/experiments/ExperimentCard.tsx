"use client";

import type { Experiment } from "@/types";

export function ExperimentCard({ experiment }: { experiment: Experiment }) {
  return (
    <article className="panel space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{experiment.name}</h3>
          <p className="text-sm text-labMuted">{new Date(experiment.date).toLocaleDateString()}</p>
        </div>
        {experiment.buildVersion && (
          <span className="rounded-lg border border-labBorder bg-[#0a0a0a] px-2 py-1 text-xs text-labMuted">
            {experiment.buildVersion}
          </span>
        )}
      </div>

      <p className="text-sm text-labText">
        <span className="text-labMuted">Goal:</span> {experiment.goal}
      </p>

      <div className="text-sm text-labText">
        <p className="mb-1 text-labMuted">Changes</p>
        <ul className="list-disc space-y-1 pl-5">
          {experiment.changes.map((change, index) => (
            <li key={`${change}-${index}`}>{change}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-1 text-xs text-labMuted md:grid-cols-3">
        <div>Center: {experiment.scores.centerSharpness}/10</div>
        <div>Thirds: {experiment.scores.thirdsUsability}/10</div>
        <div>Swirl: {experiment.scores.edgeSwirl}/10</div>
        <div>Glow: {experiment.scores.glow}/10</div>
        <div>Flare warmth: {experiment.scores.flareWarmth}/10</div>
        <div>Mech reliability: {experiment.scores.mechanicalReliability}/10</div>
      </div>

      <p className="text-sm text-labText">
        <span className="text-labMuted">Conclusion:</span> {experiment.conclusion}
      </p>

      <div className="text-sm text-labText">
        <p className="mb-1 text-labMuted">Next steps</p>
        <ul className="list-disc space-y-1 pl-5">
          {experiment.nextSteps.map((step, index) => (
            <li key={`${step}-${index}`}>{step}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
