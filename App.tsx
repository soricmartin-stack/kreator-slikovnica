
import React, { useState, useEffect, useRef } from 'react';
import { analyzeStory, generateCharacterSheet, generateSceneImage } from './services/geminiService';
import { StoryParams, Character, Scene, AppStep, AgeGroup, SceneSliders, CharacterTweaks } from './types';
import { AGE_STYLE_TAGS, DEFAULT_MODELS } from './constants';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.Input);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionUsage, setSessionUsage] = useState(0);
  const [params, setParams] = useState<StoryParams>({
    story: '',
    ageGroup: '5-7',
    tone: 'auto',
    sceneCount: 'auto'
  });
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeEditingScene, setActiveEditingScene] = useState<Scene | null>(null);
  const [editingSliders, setEditingSliders] = useState<SceneSliders>({
    tone: 5, excitement: 5, happiness: 5, energy: 5, tension: 5
  });

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const incrementUsage = () => setSessionUsage(prev => prev + 1);

  const handleReset = () => {
    if (step !== AppStep.Input && !window.confirm("Are you sure you want to start a new project? Current progress will be lost.")) return;
    setStep(AppStep.Input);
    setCharacters([]);
    setScenes([]);
    setParams({ story: '', ageGroup: '5-7', tone: 'auto', sceneCount: 'auto' });
    setErrorMessage(null);
  };

  const handleError = (error: any) => {
    console.error(error);
    const msg = error.message || String(error);
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      setErrorMessage("Architect Quota Exceeded. The Free Tier of the Gemini API allows approximately 15 images per minute. We are retrying automatically with delays, but if this persists, please wait 60 seconds or check your project billing status at ai.google.dev/gemini-api/docs/billing");
    } else {
      setErrorMessage("An unexpected error occurred: " + msg.substring(0, 100));
    }
  };

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!params.story.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    setStep(AppStep.Analysis);
    try {
      const { scenes, characters, determinedTone, determinedCount } = await analyzeStory(params.story, params.sceneCount, params.tone);
      
      setParams(prev => ({
        ...prev,
        tone: determinedTone,
        sceneCount: determinedCount
      }));

      setScenes(scenes.map(s => ({
        ...s, sliders: { tone: 5, excitement: 5, happiness: 5, energy: 5, tension: 5 }
      })));
      setCharacters(characters);
      setStep(AppStep.Characters);
    } catch (error) {
      handleError(error);
      setStep(AppStep.Input);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCharacter = () => {
    const newId = `char-${Date.now()}`;
    const newChar: Character = {
      id: newId,
      name: "New Character",
      description: "Enter a brief description of the character...",
      tweaks: { hair: "", clothing: "", appearance: "", personality: "", accessory: "" }
    };
    setCharacters([...characters, newChar]);
  };

  const handleRemoveCharacter = (charId: string) => {
    setCharacters(characters.filter(c => c.id !== charId));
  };

  const handleGenerateCharacter = async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    setErrorMessage(null);
    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, isGenerating: true } : c));
    try {
      const sheetUrl = await generateCharacterSheet(char, params.tone as string, AGE_STYLE_TAGS[params.ageGroup]);
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, sheetUrl, isGenerating: false } : c));
      incrementUsage();
    } catch (error) {
      handleError(error);
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, isGenerating: false } : c));
    }
  };

  const handleUploadPhoto = (charId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, uploadUrl: result } : c));
    };
    reader.readAsDataURL(file);
  };

  const updateCharacterTweaks = (charId: string, field: keyof CharacterTweaks, value: string) => {
    setCharacters(prev => prev.map(c => c.id === charId ? {
      ...c, tweaks: { ...c.tweaks, [field]: value }
    } : c));
  };

  const updateCharacterBasic = (charId: string, field: 'name' | 'description', value: string) => {
    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, [field]: value } : c));
  };

  const generateAllScenes = async () => {
    setStep(AppStep.Scenes);
    setLoading(true);
    setErrorMessage(null);
    try {
      for (const scene of scenes) {
        if (scene.imageUrl) continue;
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGenerating: true } : s));
        const imageUrl = await generateSceneImage(scene, characters, params.tone as string, AGE_STYLE_TAGS[params.ageGroup]);
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, imageUrl, isGenerating: false } : s));
        incrementUsage();
        await new Promise(r => setTimeout(r, 4500));
      }
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateScene = async (sceneId: number, useStoryText: boolean = false) => {
    const scene = scenes.find(s => s.id === sceneId)!;
    setLoading(true);
    setErrorMessage(null);
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGenerating: true } : s));
    try {
      const imageUrl = await generateSceneImage(
        scene, characters, params.tone as string, AGE_STYLE_TAGS[params.ageGroup], 
        scene.sliders, useStoryText
      );
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, isGenerating: false } : s));
      incrementUsage();
    } catch (error) {
      handleError(error);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGenerating: false } : s));
    } finally {
      setLoading(false);
    }
  };

  const tweakSceneAction = async (sceneId: number, newDescription: string, newStoryText: string, useStoryText: boolean = false) => {
    setLoading(true);
    setErrorMessage(null);
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, description: newDescription, storyText: newStoryText, sliders: editingSliders, isGenerating: true } : s));
    setActiveEditingScene(null);
    try {
      const scene = scenes.find(s => s.id === sceneId)!;
      const imageUrl = await generateSceneImage(
        { ...scene, description: newDescription, storyText: newStoryText },
        characters, params.tone as string, AGE_STYLE_TAGS[params.ageGroup], editingSliders, useStoryText
      );
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, isGenerating: false } : s));
      incrementUsage();
    } catch (error) {
      handleError(error);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isGenerating: false } : s));
    } finally {
      setLoading(false);
    }
  };

  const updateSceneStoryText = (sceneId: number, text: string) => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, storyText: text } : s));
  };

  const compressAndDownload = async (url: string, filename: string) => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve();
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(blobUrl);
          }
          resolve();
        }, 'image/jpeg', 0.95);
      };
      img.src = url;
    });
  };

  const downloadAll = async () => {
    const generatedScenes = scenes.filter(s => !!s.imageUrl);
    if (generatedScenes.length === 0) return;
    
    for (let i = 0; i < generatedScenes.length; i++) {
      const scene = generatedScenes[i];
      await compressAndDownload(scene.imageUrl!, `page-${i + 1}.jpg`);
      await new Promise(r => setTimeout(r, 400));
    }
  };

  const downloadStoryScript = () => {
    const content = scenes
      .map((scene, idx) => `PAGE ${idx + 1}\n------------------\n${scene.storyText}\n`)
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'story-script.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const isCharacterGenerating = characters.some(c => c.isGenerating);
  const allImagesReady = scenes.length > 0 && scenes.every(s => !!s.imageUrl);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <div className="bg-slate-900 text-slate-300 text-[10px] font-bold uppercase tracking-widest py-1 px-4 flex justify-between items-center sticky top-0 z-[60] border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Engine: {DEFAULT_MODELS.image.toUpperCase()}
          </span>
          <span className="opacity-20">|</span>
          <span className="flex items-center gap-2 text-white/60">
            Horizontal Smartphone (16:9)
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="bg-white/5 px-2 py-0.5 rounded text-white">
            Session Usage: {sessionUsage}
          </span>
          <span className="opacity-20">|</span>
          <span className="text-indigo-400">
            Est. Daily Remaining: {Math.max(0, 1500 - sessionUsage)} / 1500
          </span>
        </div>
      </div>

      <header className="bg-white border-b border-slate-200 sticky top-6 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-100 cursor-pointer" onClick={handleReset}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.246.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.246.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-xl font-bold font-handwriting select-none cursor-pointer" onClick={handleReset}>Picture Book Architect</h1>
          </div>
          <div className="flex items-center gap-4">
            {step !== AppStep.Input && (
              <button 
                onClick={handleReset}
                className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-widest flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                New Project
              </button>
            )}
            <div className="flex items-center gap-2 pl-4 border-l border-slate-100">
              <div className={`h-2 w-2 rounded-full ${loading || isCharacterGenerating ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-widest">{loading || isCharacterGenerating ? 'Architecting' : 'Ready'}</span>
            </div>
          </div>
        </div>
      </header>

      {isCharacterGenerating && (
        <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="w-64 h-64 relative mb-8">
            <div className="absolute inset-0 border-8 border-indigo-50 rounded-full"></div>
            <div className="absolute inset-0 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-24 h-24 text-indigo-600 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-bold font-handwriting text-slate-900 mb-2">Sketching the Hero...</h2>
          <p className="text-slate-500 text-center max-w-sm px-6">Ensuring perfect consistency for every angle and expression.</p>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        {errorMessage && (
          <div className="mb-8 p-4 bg-rose-50 border-l-4 border-rose-500 text-rose-700 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                <p className="font-bold text-sm leading-snug">{errorMessage}</p>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-600 ml-4 flex-shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        )}

        {step === AppStep.Input && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-4xl font-extrabold text-slate-900 mb-2 tracking-tight">Project Brief</h2>
              <p className="text-lg text-slate-600 italic font-handwriting">Specify your narrative and artistic constraints.</p>
            </div>
            <form onSubmit={handleStartAnalysis} className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Story Text (The Blueprint)</label>
                <textarea 
                  className="w-full h-48 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none resize-none transition-all" 
                  value={params.story} 
                  onChange={e => setParams({ ...params, story: e.target.value })} 
                  required 
                  placeholder="Paste your full story narrative here..." 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Target Audience</label>
                  <select 
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none appearance-none bg-white" 
                    value={params.ageGroup} 
                    onChange={e => setParams({ ...params, ageGroup: e.target.value as AgeGroup })}
                  >
                    <option value="2-4">Toddler (2-4 years)</option>
                    <option value="5-7">Early Reader (5-7 years)</option>
                    <option value="8-10">Intermediate (8-10 years)</option>
                    <option value="Adult">Adult / Mature Audience</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Length (Pages)</label>
                  <div className="flex gap-2">
                    <select 
                      className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none appearance-none bg-white"
                      value={params.sceneCount === 'auto' ? 'auto' : 'custom'}
                      onChange={e => setParams({ ...params, sceneCount: e.target.value === 'auto' ? 'auto' : 20 })}
                    >
                      <option value="auto">Auto (Recommended)</option>
                      <option value="custom">Custom Count</option>
                    </select>
                    {params.sceneCount !== 'auto' && (
                      <input 
                        type="number" 
                        min="5" 
                        max="40" 
                        className="w-24 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none" 
                        value={params.sceneCount} 
                        onChange={e => setParams({ ...params, sceneCount: parseInt(e.target.value) })} 
                      />
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Artistic Tone</label>
                <div className="flex gap-2">
                  <select 
                    className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none appearance-none bg-white"
                    value={params.tone === 'auto' ? 'auto' : 'custom'}
                    onChange={e => setParams({ ...params, tone: e.target.value === 'auto' ? 'auto' : '' })}
                  >
                    <option value="auto">Auto (Determine from Story)</option>
                    <option value="custom">Custom Style</option>
                  </select>
                  {params.tone !== 'auto' && (
                    <input 
                      type="text" 
                      className="flex-[2] px-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-indigo-50 outline-none" 
                      placeholder="Whimsical, Noir, Watercolor..." 
                      value={params.tone} 
                      onChange={e => setParams({ ...params, tone: e.target.value })} 
                    />
                  )}
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100">
                Initialize Construction
              </button>
            </form>
          </div>
        )}

        {step === AppStep.Analysis && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <p className="text-slate-500 font-handwriting">Deconstructing narrative for horizontal smartphone layout...</p>
          </div>
        )}

        {step === AppStep.Characters && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">Character Design Studio</h2>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md font-bold uppercase tracking-wider">Style: {params.tone}</span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-bold uppercase tracking-wider">Length: {params.sceneCount} Pages</span>
                </div>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={handleAddCharacter}
                  className="px-6 py-3 bg-white border-2 border-indigo-600 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  Add Character
                </button>
                <button 
                  onClick={generateAllScenes} 
                  disabled={loading || characters.length === 0 || characters.some(c => !c.sheetUrl)} 
                  className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-50"
                >
                  Generate All Book Pages
                </button>
              </div>
            </div>
            
            {characters.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-handwriting italic">No characters detected. Add one to get started!</p>
              </div>
            )}

            <div className="space-y-12">
              {characters.map((char) => (
                <div key={char.id} className="group bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col lg:flex-row gap-10 relative">
                  <button 
                    onClick={() => handleRemoveCharacter(char.id)}
                    className="absolute top-4 right-4 p-2 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="Remove Character"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>

                  <div className="lg:w-1/3 flex flex-col items-center gap-4">
                    <div className="flex gap-4 w-full h-full">
                      <div className="w-1/2 aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 relative flex items-center justify-center">
                        {char.uploadUrl ? (
                          <img src={char.uploadUrl} className="w-full h-full object-cover" alt="Uploaded Reference" />
                        ) : (
                          <div className="text-center px-4">
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-2">Upload Reference</span>
                            <button onClick={() => fileInputRefs.current[char.id]?.click()} className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-all">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            </button>
                          </div>
                        )}
                        <input 
                          type="file" 
                          ref={el => fileInputRefs.current[char.id] = el}
                          className="hidden" 
                          accept="image/*" 
                          onChange={(e) => handleUploadPhoto(char.id, e)} 
                        />
                        {char.uploadUrl && (
                          <button 
                            onClick={() => setCharacters(prev => prev.map(c => c.id === char.id ? { ...c, uploadUrl: undefined } : c))}
                            className="absolute top-2 right-2 p-1 bg-white/80 rounded-full text-rose-600 hover:bg-white"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        )}
                      </div>

                      <div className="w-1/2 aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 relative flex items-center justify-center">
                        {char.sheetUrl ? <img src={char.sheetUrl} className="w-full h-full object-cover" alt={char.name} /> : 
                        <div className="text-center px-6">{char.isGenerating ? <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2"></div> : <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic">Reference Sheet</span>}</div>}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 w-full">
                      <button 
                        onClick={() => fileInputRefs.current[char.id]?.click()} 
                        className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all text-xs"
                      >
                        {char.uploadUrl ? 'Change Photo' : 'Upload Photo'}
                      </button>
                      <button 
                        onClick={() => handleGenerateCharacter(char.id)} 
                        disabled={loading} 
                        className="flex-[1.5] py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all text-xs"
                      >
                        {char.sheetUrl ? 'Regenerate Sheet' : 'Generate Sheet'}
                      </button>
                    </div>
                  </div>
                  <div className="lg:w-2/3 space-y-6">
                    <div className="space-y-2">
                      <input 
                        className="text-2xl font-bold text-indigo-900 w-full border-b border-transparent hover:border-indigo-100 focus:border-indigo-600 outline-none transition-all"
                        value={char.name}
                        onChange={e => updateCharacterBasic(char.id, 'name', e.target.value)}
                        placeholder="Character Name"
                      />
                      <textarea 
                        className="text-slate-600 text-sm leading-relaxed w-full min-h-[60px] resize-none border-b border-transparent hover:border-indigo-50 focus:border-indigo-600 outline-none transition-all"
                        value={char.description}
                        onChange={e => updateCharacterBasic(char.id, 'description', e.target.value)}
                        placeholder="Character description..."
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Hair</label><input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Curly brown..." value={char.tweaks.hair} onChange={e => updateCharacterTweaks(char.id, 'hair', e.target.value)} /></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Clothing</label><input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Blue dress..." value={char.tweaks.clothing} onChange={e => updateCharacterTweaks(char.id, 'clothing', e.target.value)} /></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Appearance</label><input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Small nose..." value={char.tweaks.appearance} onChange={e => updateCharacterTweaks(char.id, 'appearance', e.target.value)} /></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Personality</label><input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Always smiling..." value={char.tweaks.personality} onChange={e => updateCharacterTweaks(char.id, 'personality', e.target.value)} /></div>
                      <div className="md:col-span-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Signature Accessory</label><input className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Red bow, magic stick..." value={char.tweaks.accessory} onChange={e => updateCharacterTweaks(char.id, 'accessory', e.target.value)} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === AppStep.Scenes && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold font-handwriting">Book Storyboard</h2>
                <p className="text-slate-500">Illustration sequence (no text rendered in images).</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={downloadStoryScript}
                  className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center gap-3 shadow-xl shadow-slate-100"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download Script (.txt)
                </button>
                <button 
                  onClick={downloadAll} 
                  disabled={scenes.every(s => !s.imageUrl)}
                  className={`px-8 py-3 rounded-2xl font-bold transition-all flex items-center gap-3 shadow-xl ${allImagesReady ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-slate-100'}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {allImagesReady ? 'Download Full Book (Optimized)' : 'Download Available Pages'}
                </button>
                <button onClick={handleReset} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-300 transition-all">Start Over</button>
              </div>
            </div>

            {allImagesReady && (
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] flex items-center gap-4 animate-in slide-in-from-top-4">
                <div className="bg-emerald-500 p-3 rounded-full text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-900">Your Masterpiece is Ready!</h4>
                  <p className="text-sm text-emerald-700">All {scenes.length} pages have been illustrated and optimized (min. 500KB per page).</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
              {scenes.map((scene, idx) => (
                <div key={scene.id} className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200 flex flex-col h-full ring-1 ring-transparent hover:ring-indigo-300 transition-all">
                  <div className="aspect-video bg-slate-50 relative border-b border-slate-100 overflow-hidden">
                    {scene.imageUrl ? (
                      <>
                        <img src={scene.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-1000" alt={`Page ${idx+1}`} />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                          <button onClick={() => handleRegenerateScene(scene.id, true)} className="bg-white p-2 rounded-lg flex flex-col items-center gap-1 hover:bg-emerald-50 transition-colors" title="Regenerate from Page Text">
                            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            <span className="text-[8px] font-bold text-emerald-800 uppercase">Sync Text</span>
                          </button>
                          <button onClick={() => setActiveEditingScene(scene)} className="bg-white p-2 rounded-lg flex flex-col items-center gap-1 hover:bg-indigo-50 transition-colors" title="Studio Tweak">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                            <span className="text-[8px] font-bold text-indigo-800 uppercase">Studio</span>
                          </button>
                          <button onClick={() => compressAndDownload(scene.imageUrl!, `page-${idx+1}.jpg`)} className="bg-white p-2 rounded-lg flex flex-col items-center gap-1 hover:bg-slate-50 transition-colors">
                            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span className="text-[8px] font-bold text-slate-800 uppercase">Save</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-8 bg-slate-100/50">
                        {scene.isGenerating ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Painting Page {idx+1}</span>
                          </div>
                        ) : <span className="text-slate-300 italic font-handwriting">Waiting...</span>}
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex-grow flex flex-col bg-white">
                    <span className="text-[10px] font-black text-indigo-400 uppercase mb-2 block tracking-widest">Page Text</span>
                    <textarea 
                      className="w-full text-sm text-slate-800 font-handwriting leading-relaxed bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-50 outline-none resize-none min-h-[120px] transition-all"
                      value={scene.storyText}
                      onChange={(e) => updateSceneStoryText(scene.id, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {activeEditingScene && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Scene {activeEditingScene.id} Studio</h3>
                <p className="text-xs text-slate-500">Fine-tune without embedded text.</p>
              </div>
              <button onClick={() => setActiveEditingScene(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div className="aspect-video rounded-[1.5rem] overflow-hidden border border-slate-100 shadow-inner bg-slate-50 relative">
                  {activeEditingScene.imageUrl && <img src={activeEditingScene.imageUrl} className="w-full h-full object-cover" alt="Current scene" />}
                  {activeEditingScene.isGenerating && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm">
                      <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                   <div>
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Visual Prompt</label>
                    <textarea className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-4 focus:ring-indigo-50 transition-all" defaultValue={activeEditingScene.description} id="tweak-desc" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Story Text</label>
                    <textarea className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-handwriting outline-none focus:ring-4 focus:ring-indigo-50 transition-all" defaultValue={activeEditingScene.storyText} id="tweak-story" />
                  </div>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-indigo-50/50 p-6 rounded-3xl space-y-4">
                  <h4 className="font-bold text-[10px] uppercase tracking-widest text-indigo-900 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                    Atmosphere
                  </h4>
                  {['tone', 'excitement', 'happiness', 'energy', 'tension'].map(s => (
                    <div key={s}>
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                        <span>{s}</span><span>{editingSliders[s as keyof SceneSliders]}</span>
                      </div>
                      <input type="range" min="1" max="10" className="w-full accent-indigo-600 h-1.5 rounded-full appearance-none bg-slate-200 cursor-pointer" value={editingSliders[s as keyof SceneSliders]} onChange={e => setEditingSliders({ ...editingSliders, [s]: parseInt(e.target.value) })} />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 pt-4">
                  <button 
                    onClick={() => {
                      const d = (document.getElementById('tweak-desc') as HTMLTextAreaElement).value;
                      const s = (document.getElementById('tweak-story') as HTMLTextAreaElement).value;
                      tweakSceneAction(activeEditingScene.id, d, s, false);
                    }} 
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                  >
                    Regenerate (Prompt)
                  </button>
                  <button 
                    onClick={() => {
                      const d = (document.getElementById('tweak-desc') as HTMLTextAreaElement).value;
                      const s = (document.getElementById('tweak-story') as HTMLTextAreaElement).value;
                      tweakSceneAction(activeEditingScene.id, d, s, true);
                    }} 
                    className="w-full py-4 bg-white border-2 border-indigo-600 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-50 transition-all"
                  >
                    Regenerate (Story Text)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
