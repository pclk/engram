import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- Configuration & Types ---

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

type Mode = 'BLOCK' | 'NORMAL' | 'INSERT';
type DerivativeType = 'PROBING' | 'CLOZE';

interface Derivative {
  id: string;
  type: DerivativeType;
  text: string;
  aiResponse?: string;
}

interface Concept {
  id: string;
  text: string;
  aiResponse?: string;
  derivatives: Derivative[];
}

interface Topic {
  id: string;
  title: string;
  concepts: Concept[];
}

// History State
interface HistoryState {
  topic: Topic;
  cursorIdx: number;
  derivIdx: number;
}

// --- Helpers ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_TOPIC: Topic = {
  id: 't1',
  title: 'Information Theory',
  concepts: [
    {
      id: 'c1',
      text: 'Entropy represents the expected value of information contained in a message.',
      derivatives: [
        { id: 'd1', type: 'PROBING', text: 'How does this relate to compression?' },
        { id: 'd2', type: 'CLOZE', text: 'High entropy implies {{c1::unpredictability}}.' }
      ]
    }
  ]
};

function sortDerivatives(derivatives: Derivative[]): Derivative[] {
  return [...derivatives].sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === 'PROBING' ? -1 : 1;
  });
}

const isWordChar = (char: string) => /[a-zA-Z0-9_]/.test(char);

const findNextWord = (text: string, idx: number) => {
  if (idx >= text.length) return text.length;
  let i = idx;
  if (isWordChar(text[i])) {
    while (i < text.length && isWordChar(text[i])) i++;
  }
  while (i < text.length && !isWordChar(text[i])) i++;
  return i;
};

const findPrevWord = (text: string, idx: number) => {
  if (idx <= 0) return 0;
  let i = idx;
  i--;
  while (i > 0 && !isWordChar(text[i])) i--;
  while (i > 0 && isWordChar(text[i - 1])) i--;
  return i;
};

function useUndo(initialState: HistoryState) {
  const [past, setPast] = useState<HistoryState[]>([]);
  const [present, setPresent] = useState<HistoryState>(initialState);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const pushState = (newState: HistoryState) => {
    setPast(prev => [...prev, present]);
    setPresent(newState);
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setFuture(prev => [present, ...prev]);
    setPresent(previous);
    setPast(newPast);
    return previous;
  };

  const redo = () => {
    if (future.length === 0) return null;
    const next = future[0];
    const newFuture = future.slice(1);
    setPast(prev => [...prev, present]);
    setPresent(next);
    setFuture(newFuture);
    return next;
  };

  return { state: present, setState: setPresent, pushState, undo, redo };
}

// --- Components ---

const HintGroup = ({ label, children }: { label: string, children: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-bold text-[#565f89] uppercase tracking-wider">{label}</span>
        <div className="flex gap-2 text-[#c0caf5] text-[10px] font-medium font-mono">
            {children}
        </div>
    </div>
);

// --- Main App ---

const App = () => {
  const { state: hState, setState: setHState, pushState, undo, redo } = useUndo({
    topic: INITIAL_TOPIC,
    cursorIdx: 0,
    derivIdx: -1
  });

  const { topic, cursorIdx, derivIdx } = hState;
  const [mode, setMode] = useState<Mode>('BLOCK');
  const [normalCursor, setNormalCursor] = useState(0);
  const [keyBuffer, setKeyBuffer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ankifyStatus, setAnkifyStatus] = useState<'IDLE' | 'SUCCESS'>('IDLE');
  const [selectionPending, setSelectionPending] = useState<{
    action: 'DELETE' | 'CHANGE', 
    type: DerivativeType, 
    candidates: Derivative[] 
  } | null>(null);

  const currentConcept = topic.concepts[cursorIdx];
  const currentDeriv = (derivIdx >= 0 && currentConcept && currentConcept.derivatives.length > derivIdx) 
    ? currentConcept.derivatives[derivIdx] 
    : null;

  const activeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const updateTopic = (newTopic: Topic, newCursorIdx = cursorIdx, newDerivIdx = derivIdx) => {
    pushState({ topic: newTopic, cursorIdx: newCursorIdx, derivIdx: newDerivIdx });
  };

  const updateText = (text: string) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    if (derivIdx === -1) {
      newTopic.concepts[cursorIdx] = { ...newTopic.concepts[cursorIdx], text };
    } else {
      const newDerivs = [...newTopic.concepts[cursorIdx].derivatives];
      newDerivs[derivIdx] = { ...newDerivs[derivIdx], text };
      newTopic.concepts[cursorIdx].derivatives = newDerivs;
    }
    setHState({ ...hState, topic: newTopic });
  };

  const commitToHistory = () => pushState(hState);

  const handleAnkify = () => {
    setAnkifyStatus('SUCCESS');
    setTimeout(() => setAnkifyStatus('IDLE'), 1500);
  };

  const handleGenerate = async () => {
    if (!currentConcept || !currentConcept.text) return;
    setIsGenerating(true);
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Generate 2 distinct study derivatives (strictly one PROBING question, one CLOZE deletion sentence) based on this concept: "${currentConcept.text}".`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, enum: ['PROBING', 'CLOZE'] },
                            text: { type: Type.STRING }
                        },
                        required: ['type', 'text']
                    }
                }
            }
        });
        
        const rawText = response.text;
        if (rawText) {
            const data = JSON.parse(rawText) as {type: string, text: string}[];
            const newDerivs: Derivative[] = data.map(d => ({
                id: generateId(),
                type: (d.type.toUpperCase() === 'PROBING' ? 'PROBING' : 'CLOZE') as DerivativeType,
                text: d.text
            }));
            
            const newTopic = { ...topic, concepts: [...topic.concepts] };
            newTopic.concepts[cursorIdx].derivatives = sortDerivatives([
                ...newTopic.concepts[cursorIdx].derivatives,
                ...newDerivs
            ]);
            updateTopic(newTopic);
        }
    } catch (e) {
        console.error("AI Generation failed", e);
    } finally {
        setIsGenerating(false);
    }
  };

  const performDelete = (targetIdx: number) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    const concept = newTopic.concepts[cursorIdx];
    const targetId = selectionPending?.candidates[targetIdx].id;
    concept.derivatives = concept.derivatives.filter(d => d.id !== targetId);
    updateTopic(newTopic);
    setSelectionPending(null);
    setKeyBuffer('');
  };

  const performChange = (targetIdx: number) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    const concept = newTopic.concepts[cursorIdx];
    const targetId = selectionPending?.candidates[targetIdx].id;
    const realIdx = concept.derivatives.findIndex(d => d.id === targetId);
    if (realIdx !== -1) {
      concept.derivatives[realIdx].text = '';
      setHState({ topic: newTopic, cursorIdx, derivIdx: realIdx }); 
      pushState({ topic: newTopic, cursorIdx, derivIdx: realIdx }); 
      setMode('INSERT');
      setNormalCursor(0);
      setHState(prev => ({ ...prev, derivIdx: realIdx }));
    }
    setSelectionPending(null);
    setKeyBuffer('');
  };

  const navigateSearch = (query: string, reverse: boolean) => {
     if (!query) return;
     const q = query.toLowerCase();
     
     const items: { cIdx: number, dIdx: number, text: string }[] = [];
     topic.concepts.forEach((c, ci) => {
         items.push({ cIdx: ci, dIdx: -1, text: c.text });
         c.derivatives.forEach((d, di) => {
             items.push({ cIdx: ci, dIdx: di, text: d.text });
         });
     });

     let currentPos = items.findIndex(item => item.cIdx === cursorIdx && item.dIdx === derivIdx);
     if (currentPos === -1) currentPos = 0;

     let foundIdx = -1;
     if (reverse) {
         for (let i = currentPos - 1; i >= 0; i--) {
             if (items[i].text.toLowerCase().includes(q)) { foundIdx = i; break; }
         }
         if (foundIdx === -1) {
             for (let i = items.length - 1; i > currentPos; i--) {
                 if (items[i].text.toLowerCase().includes(q)) { foundIdx = i; break; }
             }
         }
     } else {
         for (let i = currentPos + 1; i < items.length; i++) {
             if (items[i].text.toLowerCase().includes(q)) { foundIdx = i; break; }
         }
         if (foundIdx === -1) {
             for (let i = 0; i <= currentPos; i++) {
                 if (items[i].text.toLowerCase().includes(q)) { foundIdx = i; break; }
             }
         }
     }

     if (foundIdx !== -1) {
         const target = items[foundIdx];
         setHState(prev => ({ ...prev, cursorIdx: target.cIdx, derivIdx: target.dIdx }));
         // Update normal cursor to the start of the match if found
         const matchIdx = target.text.toLowerCase().indexOf(q);
         if (matchIdx !== -1) setNormalCursor(matchIdx);
     }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSearching) {
        if (e.key === 'Escape') { setIsSearching(false); setSearchQuery(''); }
        if (e.key === 'Enter') {
            const query = searchQuery;
            setLastSearchQuery(query);
            navigateSearch(query, false);
            setIsSearching(false);
        }
        return;
      }

      if (selectionPending) {
        e.preventDefault();
        if (e.key === 'Escape') { setSelectionPending(null); setKeyBuffer(''); return; }
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= selectionPending.candidates.length) {
          if (selectionPending.action === 'DELETE') performDelete(num - 1);
          if (selectionPending.action === 'CHANGE') performChange(num - 1);
        }
        return;
      }

      if (mode === 'INSERT') {
        if (e.key === 'Escape') {
          e.preventDefault();
          setMode('NORMAL');
          commitToHistory();
          setNormalCursor(prev => Math.max(0, prev - 1));
        }
        return;
      }

      if (mode === 'NORMAL') {
        e.preventDefault(); 
        const text = derivIdx === -1 ? currentConcept.text : (currentDeriv?.text || '');
        if (e.key === 'Escape') { setMode('BLOCK'); return; }
        
        // Search in Normal Mode
        if (e.key === '/') { setIsSearching(true); setSearchQuery(''); return; }
        if (e.key === 'n') { navigateSearch(lastSearchQuery, false); return; }
        if (e.key === 'N') { navigateSearch(lastSearchQuery, true); return; }

        if (e.key === 'i') { setMode('INSERT'); return; }
        if (e.key === 'I') { setMode('INSERT'); setNormalCursor(0); return; }
        if (e.key === 'a') { setMode('INSERT'); setNormalCursor(prev => Math.min(prev + 1, text.length)); return; }
        if (e.key === 'A') { setMode('INSERT'); setNormalCursor(text.length); return; }
        if (e.key === 'h') setNormalCursor(prev => Math.max(0, prev - 1));
        if (e.key === 'l') setNormalCursor(prev => Math.min(text.length - 1, prev + 1));
        if (e.key === '0') setNormalCursor(0);
        if (e.key === '$') setNormalCursor(text.length - 1);
        if (e.key === 'w') setNormalCursor(prev => findNextWord(text, prev));
        if (e.key === 'b') setNormalCursor(prev => findPrevWord(text, prev));
        if (e.key === 'u') undo();
        if (e.key === 'r' && e.ctrlKey) redo();
        return;
      }

      if (mode === 'BLOCK') {
        e.preventDefault();
        if (e.key === '/') { setIsSearching(true); setSearchQuery(''); return; }
        if (e.key === 'n') { navigateSearch(lastSearchQuery, false); return; }
        if (e.key === 'N') { navigateSearch(lastSearchQuery, true); return; }
        
        if (e.key === 'i') {
            if (derivIdx !== -1 && !currentDeriv) return; 
            setMode('NORMAL');
            setNormalCursor(0);
            return;
        }
        if (e.key === 'a') {
            if (derivIdx !== -1 && !currentDeriv) return;
            setMode('NORMAL');
            const text = derivIdx === -1 ? currentConcept.text : (currentDeriv?.text || '');
            setNormalCursor(text.length);
            return;
        }

        if (keyBuffer) {
            if (e.key === 'Escape') { setKeyBuffer(''); return; }
            if (keyBuffer === 'o') {
                if (e.key === 'p') { 
                    const newId = generateId();
                    const newTopic = { ...topic, concepts: [...topic.concepts] };
                    const concept = newTopic.concepts[cursorIdx];
                    concept.derivatives = sortDerivatives([...concept.derivatives, { id: newId, type: 'PROBING', text: '' }]);
                    const newIdx = concept.derivatives.findIndex(d => d.id === newId);
                    updateTopic(newTopic, cursorIdx, newIdx);
                    setMode('INSERT');
                } else if (e.key === 'c') { 
                    const newId = generateId();
                    const newTopic = { ...topic, concepts: [...topic.concepts] };
                    const concept = newTopic.concepts[cursorIdx];
                    concept.derivatives = sortDerivatives([...concept.derivatives, { id: newId, type: 'CLOZE', text: '' }]);
                    const newIdx = concept.derivatives.findIndex(d => d.id === newId);
                    updateTopic(newTopic, cursorIdx, newIdx);
                    setMode('INSERT');
                }
                setKeyBuffer('');
                return;
            }
            if (keyBuffer === 'd') {
                if (e.key === 'd') { 
                    if (derivIdx === -1) {
                        const newTopic = { ...topic, concepts: topic.concepts.filter((_, i) => i !== cursorIdx) };
                        if (newTopic.concepts.length === 0) newTopic.concepts = [{id: generateId(), text: '', derivatives:[]}];
                        updateTopic(newTopic, Math.min(cursorIdx, newTopic.concepts.length - 1), -1);
                    } else if (currentDeriv) {
                        const newTopic = { ...topic, concepts: [...topic.concepts] };
                        const concept = newTopic.concepts[cursorIdx];
                        concept.derivatives = concept.derivatives.filter((_, i) => i !== derivIdx);
                        updateTopic(newTopic, cursorIdx, Math.max(-1, derivIdx - 1));
                    }
                    setKeyBuffer('');
                } else if (e.key === 'p') {
                    const probes = currentConcept.derivatives.filter(d => d.type === 'PROBING');
                    if (probes.length === 1) {
                         const targetId = probes[0].id;
                         const newTopic = { ...topic, concepts: [...topic.concepts] };
                         newTopic.concepts[cursorIdx].derivatives = newTopic.concepts[cursorIdx].derivatives.filter(d => d.id !== targetId);
                         updateTopic(newTopic);
                         setKeyBuffer('');
                    } else if (probes.length > 1) {
                        setSelectionPending({ action: 'DELETE', type: 'PROBING', candidates: probes });
                    } else { setKeyBuffer(''); }
                } else if (e.key === 'c') {
                    const clozes = currentConcept.derivatives.filter(d => d.type === 'CLOZE');
                    if (clozes.length === 1) {
                         const targetId = clozes[0].id;
                         const newTopic = { ...topic, concepts: [...topic.concepts] };
                         newTopic.concepts[cursorIdx].derivatives = newTopic.concepts[cursorIdx].derivatives.filter(d => d.id !== targetId);
                         updateTopic(newTopic);
                         setKeyBuffer('');
                    } else if (clozes.length > 1) {
                        setSelectionPending({ action: 'DELETE', type: 'CLOZE', candidates: clozes });
                    } else { setKeyBuffer(''); }
                }
                return;
            }
            if (keyBuffer === 'c') {
                if (e.key === 'c') {
                    const newTopic = { ...topic, concepts: [...topic.concepts] };
                    if (derivIdx === -1) newTopic.concepts[cursorIdx].text = '';
                    else if (currentDeriv) newTopic.concepts[cursorIdx].derivatives[derivIdx].text = '';
                    updateTopic(newTopic);
                    setMode('INSERT');
                    setNormalCursor(0);
                    setKeyBuffer('');
                } else if (e.key === 'p') {
                     const probes = currentConcept.derivatives.filter(d => d.type === 'PROBING');
                     if (probes.length === 1) {
                        const targetId = probes[0].id;
                        const realIdx = currentConcept.derivatives.findIndex(d => d.id === targetId);
                        const newTopic = { ...topic, concepts: [...topic.concepts] };
                        newTopic.concepts[cursorIdx].derivatives[realIdx].text = '';
                        updateTopic(newTopic, cursorIdx, realIdx);
                        setMode('INSERT');
                        setNormalCursor(0);
                        setKeyBuffer('');
                     } else if (probes.length > 1) {
                        setSelectionPending({ action: 'CHANGE', type: 'PROBING', candidates: probes });
                     } else { setKeyBuffer(''); }
                } else if (e.key === 'l') {
                     const clozes = currentConcept.derivatives.filter(d => d.type === 'CLOZE');
                     if (clozes.length === 1) {
                        const targetId = clozes[0].id;
                        const realIdx = currentConcept.derivatives.findIndex(d => d.id === targetId);
                        const newTopic = { ...topic, concepts: [...topic.concepts] };
                        newTopic.concepts[cursorIdx].derivatives[realIdx].text = '';
                        updateTopic(newTopic, cursorIdx, realIdx);
                        setMode('INSERT');
                        setNormalCursor(0);
                        setKeyBuffer('');
                     } else if (clozes.length > 1) {
                        setSelectionPending({ action: 'CHANGE', type: 'CLOZE', candidates: clozes });
                     } else { setKeyBuffer(''); }
                }
                return;
            }
        }
        if (e.key === 'g') {
            if (derivIdx === -1 && !keyBuffer) handleGenerate();
        }
        if (e.key === 'z') {
            if (!keyBuffer) handleAnkify();
        }
        if (e.key === 'j') {
            if (derivIdx === -1) setHState(prev => ({ ...prev, cursorIdx: Math.min(prev.cursorIdx + 1, topic.concepts.length - 1) }));
            else {
                const maxIdx = Math.max(0, currentConcept.derivatives.length - 1);
                setHState(prev => ({ ...prev, derivIdx: Math.min(prev.derivIdx + 1, maxIdx) }));
            }
        }
        if (e.key === 'k') {
            if (derivIdx === -1) setHState(prev => ({ ...prev, cursorIdx: Math.max(0, prev.cursorIdx - 1) }));
            else setHState(prev => ({ ...prev, derivIdx: Math.max(0, prev.derivIdx - 1) }));
        }
        if (e.key === 'h') { if (derivIdx !== -1) setHState(prev => ({ ...prev, derivIdx: -1 })); }
        if (e.key === 'l') { 
            if (derivIdx === -1) setHState(prev => ({ ...prev, derivIdx: 0 })); 
        }
        if (e.key === 'o') {
            if (derivIdx === -1) {
                const newId = generateId();
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts.splice(cursorIdx + 1, 0, { id: newId, text: '', derivatives: [] });
                updateTopic(newTopic, cursorIdx + 1, -1);
                setMode('INSERT');
            } else setKeyBuffer('o');
        }
        if (e.key === 'O') {
             if (derivIdx === -1) {
                const newId = generateId();
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts.splice(cursorIdx, 0, { id: newId, text: '', derivatives: [] });
                updateTopic(newTopic, cursorIdx, -1);
                setMode('INSERT');
             }
        }
        if (e.key === 'd') setKeyBuffer('d');
        if (e.key === 'c') setKeyBuffer('c');
        if (e.key === 'u') undo();
        if (e.key === 'r' && e.ctrlKey) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, keyBuffer, hState, isSearching, selectionPending, lastSearchQuery, cursorIdx, derivIdx, searchQuery]);

  useLayoutEffect(() => {
    if (activeRef.current) activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [cursorIdx, derivIdx]);

  useEffect(() => {
    if (mode === 'INSERT' && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(normalCursor, normalCursor);
    }
  }, [mode, normalCursor]);

  const renderTextWithCursor = (text: string, isFocused: boolean) => {
    const sQuery = isSearching ? searchQuery : lastSearchQuery;
    const hasSearch = !!sQuery;
    
    // Highlight colors
    const matchClass = isFocused 
        ? "bg-[#ff9e64] text-[#1a1b26]" // Focused: Dark Orange
        : "bg-[#e0af68] text-[#1a1b26]"; // Unfocused: Yellow

    // Normal Mode (Character based with Cursor + Highlight)
    if (mode === 'NORMAL' && isFocused) {
        if (!text) return <span className="normal-focus w-2 h-5 inline-block align-middle"></span>;
        
        // Find match ranges
        const ranges: {start: number, end: number}[] = [];
        if (hasSearch) {
             const regex = new RegExp(sQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
             let match;
             while ((match = regex.exec(text)) !== null) {
                 ranges.push({ start: match.index, end: match.index + match[0].length });
             }
        }

        const chars = text.split('');
        return (
            <span>
                {chars.map((char, i) => {
                    const isMatch = ranges.some(r => i >= r.start && i < r.end);
                    let className = "";
                    if (isMatch) className += matchClass + " ";
                    if (i === normalCursor) className += "char-cursor ";
                    
                    return <span key={i} className={className}>{char}</span>;
                })}
                {normalCursor === text.length && <span className="char-cursor">&nbsp;</span>}
            </span>
        );
    }

    // Block/Insert Mode (Word/Segment based Highlight)
    if (hasSearch && sQuery) {
         // Case insensitive split preserving delimiters
         const regex = new RegExp(`(${sQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
         const parts = text.split(regex);
         return (
             <span>
                 {parts.map((part, i) => (
                     part.toLowerCase() === sQuery.toLowerCase() 
                     ? <span key={i} className={matchClass}>{part}</span>
                     : <span key={i} className={!text && i===0 ? "opacity-30 italic" : ""}>{part || (text ? "" : "Empty...")}</span>
                 ))}
             </span>
         );
    }

    return <span className={!text ? "opacity-30 italic" : ""}>{text || "Empty..."}</span>;
  };

  const getStatusColor = () => {
    // Tokyo Night Colors
    if (mode === 'BLOCK') return 'bg-[#7aa2f7]'; // Blue
    if (mode === 'NORMAL') return 'bg-[#9ece6a]'; // Green
    return 'bg-[#ff9e64]'; // Orange
  };

  const getModeLabel = () => {
      if (mode === 'BLOCK') return derivIdx === -1 ? 'BLOCK - CONCEPT' : 'BLOCK - DERIVATIVE';
      return mode;
  };

  const renderOptions = () => {
    if (selectionPending) return (
      <div className="flex items-center gap-2">
        <span className="text-[#ff9e64] text-[10px] font-bold">SELECT {selectionPending.type}</span>
        {selectionPending.candidates.map((_, i) => <span key={i} className="px-1.5 py-0.5 border border-[#ff9e64] text-[#ff9e64] rounded text-[10px]">{i+1}</span>)}
        <span className="text-[10px] opacity-50">ESC Cancel</span>
      </div>
    );

    if (mode === 'INSERT') return <HintGroup label="Mode">Esc:Normal</HintGroup>;
    
    if (mode === 'NORMAL') {
        return (
            <div className="flex gap-4">
                <HintGroup label="Mode">Esc:Block</HintGroup>
                <HintGroup label="Edit">i/a</HintGroup>
                <HintGroup label="Nav">h/j/k/l w/b / n/N</HintGroup>
                <HintGroup label="Ops">u:Undo r:Redo</HintGroup>
            </div>
        );
    }

    if (mode === 'BLOCK') {
      if (keyBuffer === 'o') return <HintGroup label="Add">p:Probing c:Cloze Esc</HintGroup>;
      if (keyBuffer === 'd') return <HintGroup label="Delete">d:Self p:Probing c:Cloze Esc</HintGroup>;
      if (keyBuffer === 'c') return <HintGroup label="Change">c:Self p:Probing l:Cloze Esc</HintGroup>;

      return (
        <div className="flex gap-4">
            <HintGroup label="Nav">j/k h/l</HintGroup>
            <HintGroup label="Edit">i/a o/O</HintGroup>
            <HintGroup label="Ops">d c / g z</HintGroup>
        </div>
      );
    }
    return null;
  };

  const isFocusMode = mode === 'NORMAL' || mode === 'INSERT';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5] font-sans">
      {/* Top Bar */}
      <div className="p-4 border-b border-[#16161e] bg-[#16161e] flex justify-between items-center z-10 h-16">
        <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gradient-to-br from-[#7aa2f7] to-[#bb9af7] rounded flex items-center justify-center text-[#1a1b26] font-bold text-xs shadow-lg">EG</div>
             <h1 className="text-sm font-bold text-[#c0caf5]">{topic.title}</h1>
        </div>
        
        {/* Header Options - Expanded */}
        <div className="flex-1 flex justify-center px-4">
            {renderOptions()}
        </div>

        <div className="flex items-center gap-3 justify-end min-w-[120px]">
             {keyBuffer && <span className="text-[#c0caf5] bg-[#f7768e]/50 px-2 rounded animate-pulse text-[10px] mono">CHORD: {keyBuffer}</span>}
             
             {/* Right-side Controls */}
             <div className="flex gap-2">
                <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded transition-colors ${isGenerating ? 'bg-[#bb9af7]/40 text-[#1a1b26] animate-pulse' : 'text-[#bb9af7] hover:bg-[#bb9af7]/10'}`}>
                    <span className="border border-[#bb9af7]/30 px-1 rounded bg-[#bb9af7]/10 min-w-[1.2rem] text-center">g</span>
                    <span>AI</span>
                </div>
                <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded transition-colors duration-500 ${ankifyStatus === 'SUCCESS' ? 'bg-[#9ece6a] text-[#1a1b26]' : 'text-[#7dcfff] hover:bg-[#7dcfff]/10'}`}>
                    <span className={`border px-1 rounded min-w-[1.2rem] text-center ${ankifyStatus === 'SUCCESS' ? 'border-transparent bg-black/10' : 'border-[#7dcfff]/30 bg-[#7dcfff]/10'}`}>z</span>
                    <span>{ankifyStatus === 'SUCCESS' ? 'SYNCED' : 'ANKIFY'}</span>
                </div>
             </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-3xl mx-auto pb-20 space-y-6">
          {topic.concepts.map((concept, cIdx) => {
             const isConceptActive = cursorIdx === cIdx && derivIdx === -1;
             const conceptOpacity = isFocusMode && !isConceptActive ? 'opacity-20 grayscale transition-all duration-300' : 'opacity-100 transition-all duration-300';
             
             return (
                 <div 
                   key={concept.id}
                   ref={cursorIdx === cIdx && derivIdx === -1 ? activeRef : null}
                   className={`p-4 rounded transition-all duration-100 relative
                     border bg-[#24283b]
                     ${cursorIdx === cIdx && derivIdx === -1 && mode === 'BLOCK' 
                        ? 'border-[#7aa2f7] ring-1 ring-[#7aa2f7] shadow-[0_0_20px_rgba(122,162,247,0.1)]' 
                        : 'border-[#7aa2f7]/20'}
                   `}
                 >
                    <div className={`flex gap-4 ${conceptOpacity}`}>
                        <span className="mono text-xs opacity-50 mt-1.5 text-[#565f89]">{String(cIdx + 1).padStart(2, '0')}</span>
                        <div className="flex-1 text-lg leading-relaxed relative font-mono">
                            {mode === 'INSERT' && cursorIdx === cIdx && derivIdx === -1 && (
                                <textarea
                                    ref={inputRef}
                                    value={concept.text}
                                    onChange={(e) => {
                                        updateText(e.target.value);
                                        setNormalCursor(e.target.selectionStart);
                                    }}
                                    onSelect={(e) => setNormalCursor(e.currentTarget.selectionStart)}
                                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#ff9e64] outline-none resize-none overflow-hidden z-10 font-mono text-lg leading-relaxed"
                                    spellCheck={false}
                                />
                            )}
                            <div className={`break-words whitespace-pre-wrap min-h-[1.5em] text-[#c0caf5]`}>
                                {renderTextWithCursor(concept.text, cursorIdx === cIdx && derivIdx === -1)}
                            </div>
                        </div>
                    </div>

                    {/* Derivatives Area */}
                    <div className="ml-10 mt-4 pl-4 border-l border-[#565f89]/30 space-y-3">
                        {/* Render Derivatives */}
                        {concept.derivatives.map((deriv, dIdx) => {
                            const isCandidate = selectionPending && selectionPending.candidates.some(c => c.id === deriv.id) && selectionPending.candidates[0].type === deriv.type && cursorIdx === cIdx;
                            const candidateIndex = isCandidate ? selectionPending.candidates.findIndex(c => c.id === deriv.id) + 1 : null;
                            const isProbing = deriv.type === 'PROBING';
                            const isDerivActive = cursorIdx === cIdx && derivIdx === dIdx;
                            const derivOpacity = isFocusMode && !isDerivActive ? 'opacity-20 grayscale transition-all duration-300' : 'opacity-100 transition-all duration-300';
                            
                            // Tokyo Night Colors
                            const borderColor = isProbing ? 'border-[#ff9e64]/30' : 'border-[#bb9af7]/30';
                            const bgColor = isProbing ? 'bg-[#ff9e64]/10' : 'bg-[#bb9af7]/10';
                            const focusRing = isProbing ? 'ring-[#ff9e64]' : 'ring-[#bb9af7]';
                            const badgeBg = isProbing ? 'bg-[#ff9e64]/20' : 'bg-[#bb9af7]/20';
                            const badgeText = isProbing ? 'text-[#ff9e64]' : 'text-[#bb9af7]';

                            return (
                                <div 
                                    key={deriv.id}
                                    ref={cursorIdx === cIdx && derivIdx === dIdx ? activeRef : null}
                                    className={`p-3 rounded relative transition-all duration-100 border ${borderColor} ${bgColor} ${derivOpacity}
                                        ${cursorIdx === cIdx && derivIdx === dIdx && mode === 'BLOCK' ? `ring-1 ${focusRing} shadow-[0_0_15px_rgba(0,0,0,0.3)]` : ''}
                                    `}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider mt-0.5 ${badgeBg} ${badgeText}`}>
                                            {isProbing ? '?' : 'C'}
                                        </span>
                                        {isCandidate && (
                                            <span className="bg-[#f7768e] text-[#1a1b26] text-[10px] font-bold px-1.5 rounded animate-bounce">
                                                [{candidateIndex}]
                                            </span>
                                        )}
                                        <div className="flex-1 text-sm opacity-90 relative font-mono">
                                            {mode === 'INSERT' && cursorIdx === cIdx && derivIdx === dIdx && (
                                                <textarea
                                                    ref={inputRef}
                                                    value={deriv.text}
                                                    onChange={(e) => {
                                                        updateText(e.target.value);
                                                        setNormalCursor(e.target.selectionStart);
                                                    }}
                                                    onSelect={(e) => setNormalCursor(e.currentTarget.selectionStart)}
                                                    className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#ff9e64] outline-none resize-none overflow-hidden z-10 font-mono text-sm"
                                                    spellCheck={false}
                                                />
                                            )}
                                            <div className={`break-words whitespace-pre-wrap min-h-[1.5em] text-[#a9b1d6]`}>
                                                {renderTextWithCursor(deriv.text, cursorIdx === cIdx && derivIdx === dIdx)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Empty State / Ghost Block */}
                        {concept.derivatives.length === 0 && (
                            <div 
                               ref={cursorIdx === cIdx && derivIdx === 0 ? activeRef : null}
                               className={`p-3 rounded border border-dashed border-[#565f89]/30 text-xs font-mono text-[#565f89] flex items-center gap-2 transition-all
                               ${cursorIdx === cIdx && derivIdx === 0 ? 'ring-1 ring-[#565f89] bg-[#565f89]/10 text-[#c0caf5]' : ''}`}
                            >
                                <span>No derivatives.</span>
                                {cursorIdx === cIdx && derivIdx === 0 && <span className="text-[#ff9e64] font-bold">Press 'o' to add.</span>}
                            </div>
                        )}
                    </div>
                 </div>
             );
          })}
        </div>
      </div>

      {isSearching && (
        <div className="absolute bottom-10 left-0 right-0 p-4 bg-[#16161e] border-t border-b border-[#7aa2f7] z-50 flex items-center gap-2 shadow-2xl">
            <span className="text-[#9ece6a] font-bold">/</span>
            <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent outline-none text-[#c0caf5] w-full mono" placeholder="Search..." />
        </div>
      )}

      <div className={`p-1 flex justify-between items-center text-[10px] font-bold uppercase text-[#1a1b26] transition-colors duration-200 ${getStatusColor()}`}>
        <div className="flex gap-4 px-2">
            <span>{getModeLabel()}</span>
            <span className="opacity-70">{cursorIdx + 1}:{derivIdx + 1}</span>
        </div>
        <div className="flex gap-4 px-2">
             <span className="opacity-50 tracking-widest">ENGRAM V2.3</span>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);