
import { AgeGroup } from './types';

export const AGE_STYLE_TAGS: Record<AgeGroup, string> = {
  '2-4': 'Chunky shapes, bold black outlines, high-contrast, minimalist backgrounds, vibrant primary colors, simple character features.',
  '5-7': 'Watercolor and colored pencil textures, gentle gradients, whimsical atmosphere, soft lighting, medium detail levels.',
  '8-10': 'Cinematic lighting, 3D-render aesthetic, detailed digital painting, depth of field, complex textures, realistic proportions within an illustrative style.'
};

export const DEFAULT_MODELS = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-2.5-flash-image'
};
