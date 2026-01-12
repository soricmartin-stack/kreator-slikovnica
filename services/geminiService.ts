
import { GoogleGenAI, Type } from "@google/genai";
import { DEFAULT_MODELS } from "../constants";
import { Character, Scene, AgeGroup, SceneSliders } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robustly handles API calls with exponential backoff for 429 and 5xx errors.
 */
async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable = error.message?.includes('429') || error.message?.includes('500') || error.message?.includes('503') || error.status === 429;
    
    if (retries > 0 && isRetryable) {
      console.warn(`API error detected. Retrying in ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const analyzeStory = async (
  story: string,
  sceneCount: number
): Promise<{ scenes: Scene[]; characters: Character[] }> => {
  return callWithRetry(async () => {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: DEFAULT_MODELS.text,
      contents: `Analyze this children's story and break it down into exactly ${sceneCount} sequential book pages.
      For each page, provide:
      1. "storyText": The actual text to be printed on the page.
      2. "description": A detailed visual description for an illustrator (camera angle, lighting, character actions).
      
      Also identify recurring main characters.
      
      Story: ${story}
      
      Return the data in a structured JSON format.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
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
          required: ["scenes", "characters"]
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

    const prompt = `Character Sheet for ${character.name}. Basic Concept: ${character.description}. ${tweakStr ? `Specific features: ${tweakStr}.` : ""} Professional reference sheet showing front, side, and back views, solid white background, ${tone} tone, ${styleTags}. High quality character design.`;
    
    const response = await ai.models.generateContent({
      model: DEFAULT_MODELS.image,
      contents: { parts: [{ text: prompt }] },
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
        imageConfig: { aspectRatio: "4:3" }
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
