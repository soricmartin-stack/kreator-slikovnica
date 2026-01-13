
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_MODELS } from "../constants";
import { Character, Scene, AgeGroup, SceneSliders } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robustly handles API calls with exponential backoff for 429 and 5xx errors.
 */
async function callWithRetry<T>(fn: () => Promise<T>, retries = 4, delay = 5000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    const isRetryable = errorMsg.includes('429') || 
                        errorMsg.includes('500') || 
                        errorMsg.includes('503') || 
                        errorMsg.includes('RESOURCE_EXHAUSTED') ||
                        error.status === 429;
    
    if (retries > 0 && isRetryable) {
      console.warn(`Architect Quota/Rate limit detected. Retrying in ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const analyzeStory = async (
  story: string,
  sceneCount: number | 'auto',
  tone: string | 'auto'
): Promise<{ scenes: Scene[]; characters: Character[]; determinedTone: string; determinedCount: number }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    
    const countInstruction = sceneCount === 'auto' 
      ? "Decide on an appropriate number of sequential book pages (between 5 and 40) based on the story length and emotional arc."
      : `Break the story down into exactly ${sceneCount} sequential book pages.`;
    
    const toneInstruction = tone === 'auto'
      ? "Determine an appropriate artistic tone (e.g., whimsical, noir, watercolor, cinematic) that fits the story's soul."
      : `The artistic tone for this book is "${tone}".`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODELS.text,
      contents: `Analyze this story and prepare it for illustration.
      
      Instructions:
      1. ${countInstruction}
      2. ${toneInstruction}
      3. For each page, provide:
         - "storyText": The text to be printed on the page.
         - "description": A detailed visual description for an illustrator.
      4. Identify all recurring main characters.
      
      Story: ${story}
      
      Return the data in a structured JSON format.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            determinedTone: { type: Type.STRING, description: "The artistic tone used or determined for the book." },
            determinedCount: { type: Type.INTEGER, description: "The number of pages generated." },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  storyText: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["id", "storyText", "description"]
              }
            },
            characters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["id", "name", "description"]
              }
            }
          },
          required: ["scenes", "characters", "determinedTone", "determinedCount"]
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      ...parsed,
      characters: (parsed.characters || []).map((c: any) => ({
        ...c,
        tweaks: {
          hair: "",
          clothing: "",
          appearance: "",
          personality: "",
          accessory: ""
        }
      }))
    };
  });
};

export const generateCharacterSheet = async (
  character: Character,
  tone: string,
  styleTags: string
): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const tweakStr = Object.entries(character.tweaks)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const textPrompt = `Character Sheet for ${character.name}. Basic Concept: ${character.description}. ${tweakStr ? `Specific features: ${tweakStr}.` : ""} Professional reference sheet showing front, side, and back views, solid white background, ${tone} tone, ${styleTags}. High quality character design. Use the attached image as the base reference for features and clothing.`;
    
    const parts: any[] = [{ text: textPrompt }];
    
    if (character.uploadUrl) {
      const matches = character.uploadUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (matches) {
        parts.unshift({
          inlineData: {
            mimeType: matches[1],
            data: matches[2]
          }
        });
      }
    }

    const response = await ai.models.generateContent({
      model: DEFAULT_MODELS.image,
      contents: { parts },
      config: {
        imageConfig: { aspectRatio: "1:1" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from API");
  });
};

export const generateSceneImage = async (
  scene: Scene,
  characters: Character[],
  tone: string,
  styleTags: string,
  sliders?: SceneSliders,
  useStoryText: boolean = false
): Promise<string> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const characterContext = characters.map(c => {
      const tweakStr = Object.entries(c.tweaks)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return `${c.name} (${c.description}${tweakStr ? `, with ${tweakStr}` : ""})`;
    }).join(", ");

    let sliderContext = "";
    if (sliders) {
      sliderContext = ` Atmosphere: Tone:${sliders.tone}, Excitement:${sliders.excitement}, Happiness:${sliders.happiness}, Energy:${sliders.energy}, Tension:${sliders.tension}.`;
    }

    const primaryPrompt = useStoryText ? scene.storyText : scene.description;
    const prompt = `CHILDREN'S BOOK ILLUSTRATION. Scene focus: ${primaryPrompt}. Characters present: ${characterContext}. Style: ${tone}, ${styleTags}.${sliderContext} Consistent character appearances. 4K quality.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODELS.image,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned from API");
  });
};
