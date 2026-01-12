
export type AgeGroup = '2-4' | '5-7' | '8-10';

export interface CharacterTweaks {
  hair: string;
  clothing: string;
  appearance: string;
  personality: string;
  accessory: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  sheetUrl?: string;
  isGenerating?: boolean;
  tweaks: CharacterTweaks;
}

export interface SceneSliders {
  tone: number;
  excitement: number;
  happiness: number;
  energy: number;
  tension: number;
}

export interface Scene {
  id: number;
  description: string; // Visual description for AI
  storyText: string;   // Actual text appearing in the book
  imageUrl?: string;
  isGenerating?: boolean;
  sliders?: SceneSliders;
}

export interface StoryParams {
  story: string;
  ageGroup: AgeGroup;
  tone: string;
  sceneCount: number;
}

export enum AppStep {
  Input = 'input',
  Analysis = 'analysis',
  Characters = 'characters',
  Scenes = 'scenes'
}
