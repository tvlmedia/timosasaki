export type ExperimentScores = {
  centerSharpness: number;
  thirdsUsability: number;
  edgeSwirl: number;
  glow: number;
  flareWarmth: number;
  flareControl: number;
  caUgliness: number;
  stopDownCleanup: number;
  mechanicalReliability: number;
};

export type TestImage = {
  id: string;
  label: string;
  dataUrl: string;
  notes?: string;
};

export type Experiment = {
  id: string;
  name: string;
  date: string;
  buildVersion?: string;
  goal: string;
  changes: string[];
  printNotes?: string;
  cameraTestNotes?: string;
  scores: ExperimentScores;
  images: TestImage[];
  conclusion: string;
  nextSteps: string[];
};
