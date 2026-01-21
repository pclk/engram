import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { authClient } from './lib/auth';

// --- Configuration & Types ---

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
let aiClient: any = null;
let genAiType: any = null;

const loadAi = async () => {
	if (!apiKey) return null;
	if (aiClient && genAiType) return { ai: aiClient, Type: genAiType };
	const mod = await import('@google/genai');
	aiClient = new mod.GoogleGenAI({ apiKey });
	genAiType = mod.Type;
	return { ai: aiClient, Type: genAiType };
};

type Mode = 'BLOCK' | 'NORMAL' | 'INSERT';
type DerivativeType = 'PROBING' | 'CLOZE' | 'ELABORATION';
type YankedItem =
	| { kind: 'concept'; concept: Concept }
	| { kind: 'derivative'; derivative: Derivative };

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

const createEmptyTopic = (title = 'Untitled Topic'): Topic => ({
	id: generateId(),
	title,
	concepts: [{ id: generateId(), text: '', derivatives: [] }]
});

function sortDerivatives(derivatives: Derivative[]): Derivative[] {
	const order: Record<DerivativeType, number> = {
		PROBING: 0,
		CLOZE: 1,
		ELABORATION: 2
	};
	return [...derivatives].sort((a, b) => {
		if (a.type === b.type) return 0;
		return order[a.type] - order[b.type];
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

const findLineStart = (text: string, idx: number) => {
	const before = text.lastIndexOf('\n', Math.max(0, idx - 1));
	return before === -1 ? 0 : before + 1;
};

const findLineEnd = (text: string, idx: number) => {
	const next = text.indexOf('\n', idx);
	return next === -1 ? text.length : next;
};

const moveCursorLine = (text: string, idx: number, direction: -1 | 1) => {
	if (!text.includes('\n')) return idx;
	const lineStart = findLineStart(text, idx);
	const lineEnd = findLineEnd(text, idx);
	const column = idx - lineStart;
	if (direction === 1) {
		if (lineEnd >= text.length) return idx;
		const nextStart = lineEnd + 1;
		const nextEnd = findLineEnd(text, nextStart);
		return Math.min(nextStart + column, Math.max(nextStart, nextEnd - 1));
	}
	if (lineStart === 0) return idx;
	const prevEnd = lineStart - 1;
	const prevStart = findLineStart(text, prevEnd);
	return Math.min(prevStart + column, Math.max(prevStart, prevEnd));
};

const findEndWord = (text: string, idx: number) => {
	if (!text.length) return 0;
	let i = Math.min(idx, text.length - 1);
	const atEndOfWord = isWordChar(text[i]) && (i === text.length - 1 || !isWordChar(text[i + 1]));
	if (!isWordChar(text[i]) || atEndOfWord) {
		i++;
		while (i < text.length && !isWordChar(text[i])) i++;
		if (i >= text.length) return text.length - 1;
	}
	while (i < text.length - 1 && isWordChar(text[i + 1])) i++;
	return i;
};

const trimLines = (text: string, maxLines: number) => {
	const lines = text.split('\n');
	if (lines.length <= maxLines) return text;
	return lines.slice(0, maxLines).join('\n') + '…';
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

	const commitFrom = (baseState: HistoryState, newState: HistoryState) => {
		setPast(prev => [...prev, baseState]);
		setPresent(newState);
		setFuture([]);
	};

	const reset = (newState: HistoryState) => {
		setPast([]);
		setPresent(newState);
		setFuture([]);
	};

	return { state: present, setState: setPresent, pushState, undo, redo, commitFrom, reset };
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

const LegendItem = ({ keys, description }: { keys: string; description: string }) => (
	<div className="flex items-start gap-2">
		<span className="shrink-0 rounded border border-[#2a2f45] bg-[#16161e] px-1.5 py-0.5 text-[9px] font-bold text-[#c0caf5]">
			{keys}
		</span>
		<span className="text-[10px] text-[#a9b1d6] leading-relaxed">{description}</span>
	</div>
);

// --- Main App ---

const App = () => {
	const [topics, setTopics] = useState<Topic[]>([INITIAL_TOPIC]);
	const [activeTopicId, setActiveTopicId] = useState(INITIAL_TOPIC.id);

	const { state: hState, setState: setHState, pushState, undo, redo, commitFrom, reset: resetHistory } = useUndo({
		topic: INITIAL_TOPIC,
		cursorIdx: 0,
		derivIdx: -1
	});
	const hStateRef = useRef(hState);

	const { topic, cursorIdx, derivIdx } = hState;
	const [mode, setMode] = useState<Mode>('BLOCK');
	const [normalCursor, setNormalCursor] = useState(0);
	const [keyBuffer, setKeyBuffer] = useState('');
	const [visualAnchor, setVisualAnchor] = useState<{ kind: 'text' | 'block'; cursorIdx: number; derivIdx: number; charIndex?: number } | null>(null);
	const [yankBuffer, setYankBuffer] = useState<YankedItem[] | null>(null);
	const [yankText, setYankText] = useState<string | null>(null);
	const [normalDeletePending, setNormalDeletePending] = useState(false);
	const normalDeletePendingRef = useRef(false);
	const [normalChangePending, setNormalChangePending] = useState(false);
	const normalChangePendingRef = useRef(false);
	const [normalYankPending, setNormalYankPending] = useState(false);
	const normalYankPendingRef = useRef(false);
	const [insertDirty, setInsertDirty] = useState(false);
	const insertDirtyRef = useRef(false);
	const insertSkipCommitRef = useRef(false);
	const insertBaseStateRef = useRef<HistoryState | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [lastSearchQuery, setLastSearchQuery] = useState('');
	const [isSearching, setIsSearching] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [ankifyStatus, setAnkifyStatus] = useState<'IDLE' | 'SUCCESS'>('IDLE');
	const [isAccountOpen, setIsAccountOpen] = useState(false);
	const [isDocumentSwitcherOpen, setIsDocumentSwitcherOpen] = useState(false);
	const [showKeyBuffer, setShowKeyBuffer] = useState(() => {
		try {
			const stored = localStorage.getItem('engram.showKeyBuffer');
			return stored ? stored === 'true' : true;
		} catch {
			return true;
		}
	});
	const [sessionData, setSessionData] = useState<any>(null);
	const [profileForm, setProfileForm] = useState({ name: '', email: '' });
	const [profileStatus, setProfileStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({ type: 'idle' });
	const [avatarStatus, setAvatarStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({ type: 'idle' });
	const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
	const [passwordStatus, setPasswordStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>({ type: 'idle' });
	const user = sessionData?.user;
	const userName = (user?.name || user?.displayName || user?.email || 'User') as string;
	const initials = userName
		.split(' ')
		.filter(Boolean)
		.slice(0, 2)
		.map(part => part[0]?.toUpperCase())
		.join('') || 'U';
	const [selectionPending, setSelectionPending] = useState<{
		action: 'DELETE' | 'CHANGE',
		type: DerivativeType,
		candidates: Derivative[]
	} | null>(null);
	const [topicDrafts, setTopicDrafts] = useState<Record<string, string>>({
		[INITIAL_TOPIC.id]: INITIAL_TOPIC.title
	});
	const [topicMenuIndex, setTopicMenuIndex] = useState(0);
	const topicMenuIndexRef = useRef(0);
	const [topicMenuEditingId, setTopicMenuEditingId] = useState<string | null>(null);

	const currentConcept = topic.concepts[cursorIdx];
	const currentDeriv = (derivIdx >= 0 && currentConcept && currentConcept.derivatives.length > derivIdx)
		? currentConcept.derivatives[derivIdx]
		: null;

	const syncTopicDraft = (id: string, title: string) => {
		setTopicDrafts(prev => ({ ...prev, [id]: title }));
	};

	const openTopic = (id: string) => {
		const target = topics.find(item => item.id === id);
		if (!target) return;
		const draftTitle = topicDrafts[id] ?? target.title;
		const resolvedTopic = draftTitle === target.title ? target : { ...target, title: draftTitle };
		setTopics(prev => prev.map(item => (item.id === id ? resolvedTopic : item)));
		setActiveTopicId(id);
		syncTopicDraft(id, resolvedTopic.title);
		resetHistory({ topic: resolvedTopic, cursorIdx: 0, derivIdx: -1 });
		setTopicMenuEditingId(null);
		setIsDocumentSwitcherOpen(false);
	};

	const createTopic = () => {
		const newTopic = createEmptyTopic();
		setTopics(prev => [...prev, newTopic]);
		setActiveTopicId(newTopic.id);
		syncTopicDraft(newTopic.id, newTopic.title);
		resetHistory({ topic: newTopic, cursorIdx: 0, derivIdx: -1 });
		setTopicMenuIndex(Math.max(0, topics.length));
		setTopicMenuEditingId(newTopic.id);
	};

	const renameTopic = (id: string, title: string) => {
		syncTopicDraft(id, title);
		setTopics(prev => prev.map(item => (item.id === id ? { ...item, title } : item)));
		if (id === activeTopicId) {
			setHState(prev => ({ ...prev, topic: { ...prev.topic, title } }));
		}
	};

	const deleteTopic = (id: string) => {
		setTopics(prev => {
			const filtered = prev.filter(item => item.id !== id);
			const nextTopics = filtered.length ? filtered : [createEmptyTopic()];
			const nextActive = id === activeTopicId
				? nextTopics[0]
				: (nextTopics.find(item => item.id === activeTopicId) || nextTopics[0]);
			if (nextActive.id !== activeTopicId) {
				setActiveTopicId(nextActive.id);
				syncTopicDraft(nextActive.id, nextActive.title);
				resetHistory({ topic: nextActive, cursorIdx: 0, derivIdx: -1 });
			}
			setTopicMenuIndex(prevIndex => Math.min(prevIndex, Math.max(0, nextTopics.length - 1)));
			return nextTopics;
		});
		setTopicDrafts(prev => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setTopicMenuEditingId(prev => (prev === id ? null : prev));
	};

	const activeRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const normalCursorRef = useRef(0);

	const updateTopic = (newTopic: Topic, newCursorIdx = cursorIdx, newDerivIdx = derivIdx) => {
		pushState({ topic: newTopic, cursorIdx: newCursorIdx, derivIdx: newDerivIdx });
	};

	const setCursor = (next: number) => {
		normalCursorRef.current = next;
		setNormalCursor(next);
	};

	const cloneDerivative = (derivative: Derivative): Derivative => ({
		id: generateId(),
		type: derivative.type,
		text: derivative.text,
		aiResponse: derivative.aiResponse
	});

	const cloneConcept = (concept: Concept): Concept => ({
		id: generateId(),
		text: concept.text,
		aiResponse: concept.aiResponse,
		derivatives: concept.derivatives.map(cloneDerivative)
	});

	const buildFlatBlocks = () => {
		const items: Array<{
			kind: 'concept' | 'derivative';
			cursorIdx: number;
			derivIdx: number;
			concept: Concept;
			derivative?: Derivative;
		}> = [];

		topic.concepts.forEach((concept, cIdx) => {
			items.push({ kind: 'concept', cursorIdx: cIdx, derivIdx: -1, concept });
			concept.derivatives.forEach((derivative, dIdx) => {
				items.push({
					kind: 'derivative',
					cursorIdx: cIdx,
					derivIdx: dIdx,
					concept,
					derivative
				});
			});
		});

		return items;
	};

	const yankSelection = () => {
		if (!currentConcept) return;
		if (visualAnchor && visualAnchor.kind === 'text' && typeof visualAnchor.charIndex === 'number' && mode === 'NORMAL' && visualAnchor.cursorIdx === cursorIdx && visualAnchor.derivIdx === derivIdx) {
			const baseText = derivIdx === -1 ? currentConcept.text : (currentDeriv?.text || '');
			const cursorPos = normalCursorRef.current;
			const start = Math.min(visualAnchor.charIndex, cursorPos);
			const end = Math.max(visualAnchor.charIndex, cursorPos);
			const selected = baseText.slice(start, end + 1);
			setYankText(selected);
			setYankBuffer(null);
			setVisualAnchor(null);
			return;
		}
		if (visualAnchor) {
			const items = buildFlatBlocks();
			const anchorIndex = items.findIndex(
				item => item.cursorIdx === visualAnchor.cursorIdx && item.derivIdx === visualAnchor.derivIdx
			);
			const currentIndex = items.findIndex(
				item => item.cursorIdx === cursorIdx && item.derivIdx === derivIdx
			);
			if (anchorIndex === -1 || currentIndex === -1) return;
			const [start, end] = anchorIndex <= currentIndex
				? [anchorIndex, currentIndex]
				: [currentIndex, anchorIndex];
			const selection = items.slice(start, end + 1).map(item =>
				item.kind === 'concept'
					? { kind: 'concept', concept: item.concept }
					: { kind: 'derivative', derivative: item.derivative! }
			);
			setYankBuffer(selection);
			setYankText(null);
			setVisualAnchor(null);
			return;
		}

		if (derivIdx === -1) {
			setYankBuffer([{ kind: 'concept', concept: currentConcept }]);
			setYankText(null);
			return;
		}
		if (currentDeriv) {
			setYankBuffer([{ kind: 'derivative', derivative: currentDeriv }]);
			setYankText(null);
		}
	};

	const deleteRange = (text: string, start: number, end: number) => {
		const safeStart = Math.max(0, Math.min(start, text.length));
		const safeEnd = Math.max(safeStart, Math.min(end, text.length));
		return text.slice(0, safeStart) + text.slice(safeEnd);
	};

	const deleteCurrentLine = (text: string, cursor: number) => {
		const lineStart = findLineStart(text, cursor);
		const lineEnd = findLineEnd(text, cursor);
		let start = lineStart;
		let end = lineEnd;
		if (lineEnd < text.length) end = lineEnd + 1;
		else if (lineStart > 0) start = lineStart - 1;
		return { text: deleteRange(text, start, end), cursor: start };
	};

	const applyTextChange = (text: string) => {
		const newTopic = buildTopicWithText(text);
		pushState({ topic: newTopic, cursorIdx, derivIdx });
	};

	const pasteYanked = () => {
		if (mode === 'NORMAL' && yankText && currentConcept) {
			const baseText = derivIdx === -1 ? currentConcept.text : (currentDeriv?.text || '');
			const insertAt = Math.max(0, Math.min(baseText.length, normalCursorRef.current));
			const newText = baseText.slice(0, insertAt) + yankText + baseText.slice(insertAt);
			applyTextChange(newText);
			setCursor(insertAt + yankText.length);
			return;
		}
		if (!yankBuffer || !currentConcept) return;
		const newTopic = { ...topic, concepts: [...topic.concepts] };
		let insertCursor = { cursorIdx, derivIdx };

		yankBuffer.forEach(item => {
			if (item.kind === 'concept') {
				const newConcept = cloneConcept(item.concept);
				const insertIndex = Math.min(newTopic.concepts.length, insertCursor.cursorIdx + 1);
				newTopic.concepts.splice(insertIndex, 0, newConcept);
				insertCursor = { cursorIdx: insertIndex, derivIdx: -1 };
				return;
			}

			const targetConcept = newTopic.concepts[insertCursor.cursorIdx];
			if (!targetConcept) return;
			const newDeriv = cloneDerivative(item.derivative);
			const insertIndex = insertCursor.derivIdx >= 0
				? Math.min(targetConcept.derivatives.length, insertCursor.derivIdx + 1)
				: targetConcept.derivatives.length;
			targetConcept.derivatives.splice(insertIndex, 0, newDeriv);
			insertCursor = { cursorIdx: insertCursor.cursorIdx, derivIdx: insertIndex };
		});

		updateTopic(newTopic, insertCursor.cursorIdx, insertCursor.derivIdx);
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
		if (mode === 'INSERT') {
			insertDirtyRef.current = true;
			setInsertDirty(true);
		}
	};

	const applyChangeAndEnterInsert = (text: string, nextCursor: number) => {
		const newTopic = buildTopicWithText(text);
		pushState({ topic: newTopic, cursorIdx, derivIdx });
		insertSkipCommitRef.current = true;
		setMode('INSERT');
		setCursor(nextCursor);
	};

	const buildTopicWithText = (text: string) => {
		const newTopic = { ...topic, concepts: [...topic.concepts] };
		if (derivIdx === -1) {
			newTopic.concepts[cursorIdx] = { ...newTopic.concepts[cursorIdx], text };
		} else {
			const newDerivs = [...newTopic.concepts[cursorIdx].derivatives];
			newDerivs[derivIdx] = { ...newDerivs[derivIdx], text };
			newTopic.concepts[cursorIdx].derivatives = newDerivs;
		}
		return newTopic;
	};

	const commitToHistory = () => {
		if (insertBaseStateRef.current) {
			commitFrom(insertBaseStateRef.current, hStateRef.current);
			insertBaseStateRef.current = null;
			return;
		}
		pushState(hStateRef.current);
	};

	const handleAnkify = () => {
		setAnkifyStatus('SUCCESS');
		setTimeout(() => setAnkifyStatus('IDLE'), 1500);
	};

	const handleGenerate = async () => {
		if (!currentConcept || !currentConcept.text) return;
		setIsGenerating(true);
		try {
			const loaded = await loadAi();
			if (!loaded) return;
			const { ai, Type } = loaded;
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
				const data = JSON.parse(rawText) as { type: string, text: string }[];
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
			insertSkipCommitRef.current = true;
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
			const matchIdx = target.text.toLowerCase().indexOf(q);
			if (matchIdx !== -1) setNormalCursor(matchIdx);
		}
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) return;
			const target = e.target as HTMLElement | null;
			const isTextInput = !!target && (
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable
			);
			if (isDocumentSwitcherOpen) {
				if (!isTextInput) {
					e.preventDefault();
					if (e.key === 'Escape') {
						setIsDocumentSwitcherOpen(false);
						setTopicMenuEditingId(null);
						return;
					}
					if (e.key === 'j') {
						const nextIndex = Math.min(topicMenuIndexRef.current + 1, Math.max(0, topics.length - 1));
						topicMenuIndexRef.current = nextIndex;
						setTopicMenuIndex(nextIndex);
						return;
					}
					if (e.key === 'k') {
						const nextIndex = Math.max(0, topicMenuIndexRef.current - 1);
						topicMenuIndexRef.current = nextIndex;
						setTopicMenuIndex(nextIndex);
						return;
					}
					if (e.key === 'o') {
						createTopic();
						return;
					}
					if (e.key === 'd') {
						const target = topics[topicMenuIndexRef.current];
						if (target) deleteTopic(target.id);
						return;
					}
					if (e.key === 'c') {
						const target = topics[topicMenuIndexRef.current];
						if (target) setTopicMenuEditingId(target.id);
						return;
					}
					if (e.key === 'Enter' || e.key === 'l') {
						const target = topics[topicMenuIndexRef.current];
						if (target) openTopic(target.id);
						return;
					}
					return;
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					setTopicMenuEditingId(null);
					return;
				}
				if (e.key === 'Enter') {
					e.preventDefault();
					const targetId = topicMenuEditingId;
					if (targetId) openTopic(targetId);
					return;
				}
				return;
			}

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
					if (insertDirtyRef.current && !insertSkipCommitRef.current) commitToHistory();
					insertSkipCommitRef.current = false;
					insertDirtyRef.current = false;
					setInsertDirty(false);
					insertBaseStateRef.current = null;
					setCursor(Math.max(0, normalCursorRef.current));
				}
				return;
			}

			if (mode === 'NORMAL') {
				e.preventDefault();
				const text = derivIdx === -1 ? currentConcept.text : (currentDeriv?.text || '');
				if (e.key === 'Escape') {
					if (visualAnchor) { setVisualAnchor(null); return; }
					if (keyBuffer === ' ') { setKeyBuffer(''); return; }
					if (normalYankPendingRef.current) { normalYankPendingRef.current = false; setNormalYankPending(false); return; }
					if (normalDeletePendingRef.current) { normalDeletePendingRef.current = false; setNormalDeletePending(false); return; }
					if (normalChangePendingRef.current) { normalChangePendingRef.current = false; setNormalChangePending(false); return; }
					setMode('BLOCK');
					return;
				}
				if (normalYankPendingRef.current) {
					const cursorPos = normalCursorRef.current;
					if (e.key === 'w') {
						const end = findNextWord(text, cursorPos);
						setYankText(text.slice(cursorPos, end));
						setYankBuffer(null);
					} else if (e.key === 'e') {
						const end = Math.min(text.length, findEndWord(text, cursorPos) + 1);
						setYankText(text.slice(cursorPos, end));
						setYankBuffer(null);
					} else if (e.key === 'b') {
						const start = findPrevWord(text, cursorPos);
						setYankText(text.slice(start, cursorPos));
						setYankBuffer(null);
					} else if (e.key === 'y') {
						setYankText(text);
						setYankBuffer(null);
					}
					normalYankPendingRef.current = false;
					setNormalYankPending(false);
					return;
				}
				if (normalDeletePendingRef.current) {
					const cursorPos = normalCursorRef.current;
					if (e.key === 'w') {
						const end = findNextWord(text, cursorPos);
						const newText = deleteRange(text, cursorPos, end);
						updateTopic(buildTopicWithText(newText));
						setCursor(Math.min(cursorPos, newText.length));
						normalDeletePendingRef.current = false;
						setNormalDeletePending(false);
						return;
					}
					if (e.key === 'e') {
						const end = Math.min(text.length, findEndWord(text, cursorPos) + 1);
						const newText = deleteRange(text, cursorPos, end);
						updateTopic(buildTopicWithText(newText));
						setCursor(Math.min(cursorPos, newText.length));
						normalDeletePendingRef.current = false;
						setNormalDeletePending(false);
						return;
					}
					if (e.key === 'b') {
						const start = findPrevWord(text, cursorPos);
						const newText = deleteRange(text, start, cursorPos);
						updateTopic(buildTopicWithText(newText));
						setCursor(start);
						normalDeletePendingRef.current = false;
						setNormalDeletePending(false);
						return;
					}
					if (e.key === 'd') {
						const { text: newText, cursor: nextCursor } = deleteCurrentLine(text, cursorPos);
						updateTopic(buildTopicWithText(newText));
						setCursor(Math.min(nextCursor, newText.length));
						normalDeletePendingRef.current = false;
						setNormalDeletePending(false);
						return;
					}
					normalDeletePendingRef.current = false;
					setNormalDeletePending(false);
					return;
				}
				if (normalChangePendingRef.current) {
					const cursorPos = normalCursorRef.current;
					if (e.key === 'w') {
						const end = findNextWord(text, cursorPos);
						const newText = deleteRange(text, cursorPos, end);
						applyChangeAndEnterInsert(newText, Math.min(cursorPos, newText.length));
						normalChangePendingRef.current = false;
						setNormalChangePending(false);
						return;
					}
					if (e.key === 'e') {
						const end = Math.min(text.length, findEndWord(text, cursorPos) + 1);
						const newText = deleteRange(text, cursorPos, end);
						applyChangeAndEnterInsert(newText, Math.min(cursorPos, newText.length));
						normalChangePendingRef.current = false;
						setNormalChangePending(false);
						return;
					}
					if (e.key === 'b') {
						const start = findPrevWord(text, cursorPos);
						const newText = deleteRange(text, start, cursorPos);
						applyChangeAndEnterInsert(newText, start);
						normalChangePendingRef.current = false;
						setNormalChangePending(false);
						return;
					}
					if (e.key === 'c') {
						const { text: newText, cursor: nextCursor } = deleteCurrentLine(text, cursorPos);
						applyChangeAndEnterInsert(newText, Math.min(nextCursor, newText.length));
						normalChangePendingRef.current = false;
						setNormalChangePending(false);
						return;
					}
					normalChangePendingRef.current = false;
					setNormalChangePending(false);
					return;
				}
				if (e.key === ' ') { setKeyBuffer(' '); return; }
				if (e.key === 'v') {
					setVisualAnchor(prev => (prev && prev.kind === 'text'
						? null
						: { kind: 'text', cursorIdx, derivIdx, charIndex: normalCursorRef.current }
					));
					return;
				}
				if (keyBuffer === ' ') {
					if (e.key === 'f') { setKeyBuffer(''); handleAnkify(); return; }
					if (e.key === 'g') { setKeyBuffer(''); handleGenerate(); return; }
					if (e.key === 'a') { setKeyBuffer(''); setTopicMenuEditingId(null); setIsDocumentSwitcherOpen(true); return; }
					setKeyBuffer('');
					return;
				}
				if (e.key === 'y') {
					if (visualAnchor) { yankSelection(); return; }
					normalYankPendingRef.current = true;
					setNormalYankPending(true);
					return;
				}
				if (e.key === 'p') { pasteYanked(); return; }
				if (e.key === 'd') { normalDeletePendingRef.current = true; setNormalDeletePending(true); return; }
				if (e.key === 'c') { normalChangePendingRef.current = true; setNormalChangePending(true); return; }

				if (e.key === '/') { setIsSearching(true); setSearchQuery(''); return; }
				if (e.key === 'n') { navigateSearch(lastSearchQuery, false); return; }
				if (e.key === 'N') { navigateSearch(lastSearchQuery, true); return; }

				if (e.key === 'i') { setMode('INSERT'); return; }
				if (e.key === 'I') { setMode('INSERT'); setCursor(0); return; }
				if (e.key === 'a') { setMode('INSERT'); setCursor(Math.min(normalCursorRef.current + 1, text.length)); return; }
				if (e.key === 'A') { setMode('INSERT'); setCursor(text.length); return; }
				if (e.key === 'o') {
					const lineEnd = findLineEnd(text, normalCursorRef.current);
					const newText = text.slice(0, lineEnd) + '\n' + text.slice(lineEnd);
					updateText(newText);
					setMode('INSERT');
					setCursor(lineEnd + 1);
					return;
				}
				if (e.key === 'x') {
					const cursorPos = normalCursorRef.current;
					const newText = deleteRange(text, cursorPos, cursorPos + 1);
					applyTextChange(newText);
					const nextCursor = Math.min(cursorPos, Math.max(0, newText.length - 1));
					setCursor(nextCursor);
					return;
				}
				if (e.key === 'O') {
					const lineStart = findLineStart(text, normalCursorRef.current);
					const newText = text.slice(0, lineStart) + '\n' + text.slice(lineStart);
					updateText(newText);
					setMode('INSERT');
					setCursor(lineStart);
					return;
				}
				if (e.key === 'h') setCursor(Math.max(0, normalCursorRef.current - 1));
				if (e.key === 'l') setCursor(Math.min(text.length - 1, normalCursorRef.current + 1));
				if (e.key === '0') setCursor(0);
				if (e.key === '$') setCursor(text.length - 1);
				if (e.key === 'w') setCursor(findNextWord(text, normalCursorRef.current));
				if (e.key === 'b') setCursor(findPrevWord(text, normalCursorRef.current));
				if (e.key === 'e') setCursor(findEndWord(text, normalCursorRef.current));
				if (e.key === 'j') { setCursor(moveCursorLine(text, normalCursorRef.current, 1)); return; }
				if (e.key === 'k') { setCursor(moveCursorLine(text, normalCursorRef.current, -1)); return; }
				if (e.key === 'u') undo();
				if (e.key === 'r') redo();
				return;
			}

			if (mode === 'BLOCK') {
				e.preventDefault();
				if (e.key === 'Escape' && visualAnchor) { setVisualAnchor(null); return; }
				if (e.key === 'Escape' && keyBuffer === ' ') { setKeyBuffer(''); return; }
				if (!keyBuffer && e.key === ' ') { setKeyBuffer(' '); return; }
				if (!keyBuffer && e.key === 'v') {
					setVisualAnchor(prev => (prev && prev.kind === 'block'
						? null
						: { kind: 'block', cursorIdx, derivIdx }
					));
					return;
				}
				if (keyBuffer === ' ') {
					if (e.key === 'a') { setKeyBuffer(''); setTopicMenuEditingId(null); setIsDocumentSwitcherOpen(true); return; }
					setKeyBuffer('');
					return;
				}
				if (!keyBuffer && e.key === 'y') { yankSelection(); return; }
				if (!keyBuffer && e.key === 'p') { pasteYanked(); return; }
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
						} else if (e.key === 'e') {
							const newId = generateId();
							const newTopic = { ...topic, concepts: [...topic.concepts] };
							const concept = newTopic.concepts[cursorIdx];
							concept.derivatives = sortDerivatives([...concept.derivatives, { id: newId, type: 'ELABORATION', text: '' }]);
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
								if (newTopic.concepts.length === 0) newTopic.concepts = [{ id: generateId(), text: '', derivatives: [] }];
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
						} else if (e.key === 'e') {
							const elaborations = currentConcept.derivatives.filter(d => d.type === 'ELABORATION');
							if (elaborations.length === 1) {
								const targetId = elaborations[0].id;
								const newTopic = { ...topic, concepts: [...topic.concepts] };
								newTopic.concepts[cursorIdx].derivatives = newTopic.concepts[cursorIdx].derivatives.filter(d => d.id !== targetId);
								updateTopic(newTopic);
								setKeyBuffer('');
							} else if (elaborations.length > 1) {
								setSelectionPending({ action: 'DELETE', type: 'ELABORATION', candidates: elaborations });
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
							insertSkipCommitRef.current = true;
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
								insertSkipCommitRef.current = true;
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
								insertSkipCommitRef.current = true;
								setKeyBuffer('');
							} else if (clozes.length > 1) {
								setSelectionPending({ action: 'CHANGE', type: 'CLOZE', candidates: clozes });
							} else { setKeyBuffer(''); }
						} else if (e.key === 'e') {
							const elaborations = currentConcept.derivatives.filter(d => d.type === 'ELABORATION');
							if (elaborations.length === 1) {
								const targetId = elaborations[0].id;
								const realIdx = currentConcept.derivatives.findIndex(d => d.id === targetId);
								const newTopic = { ...topic, concepts: [...topic.concepts] };
								newTopic.concepts[cursorIdx].derivatives[realIdx].text = '';
								updateTopic(newTopic, cursorIdx, realIdx);
								setMode('INSERT');
								setNormalCursor(0);
								insertSkipCommitRef.current = true;
								setKeyBuffer('');
							} else if (elaborations.length > 1) {
								setSelectionPending({ action: 'CHANGE', type: 'ELABORATION', candidates: elaborations });
							} else { setKeyBuffer(''); }
						}
						return;
					}
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
				if (e.key === 'r') redo();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [mode, keyBuffer, visualAnchor, yankBuffer, normalDeletePending, normalChangePending, normalYankPending, hState, isSearching, selectionPending, lastSearchQuery, cursorIdx, derivIdx, searchQuery, isDocumentSwitcherOpen]);

	useLayoutEffect(() => {
		if (activeRef.current) activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [cursorIdx, derivIdx]);

	const refreshSession = async () => {
		const { data } = await authClient.getSession();
		setSessionData(data ?? null);
	};

	useEffect(() => {
		let isActive = true;
		const fetchSession = async () => {
			const { data } = await authClient.getSession();
			if (isActive) setSessionData(data ?? null);
		};
		fetchSession();
		return () => {
			isActive = false;
		};
	}, [isAccountOpen]);

	useEffect(() => {
		setProfileForm({
			name: (user?.name || user?.displayName || '') as string,
			email: (user?.email || '') as string
		});
	}, [user?.name, user?.displayName, user?.email]);

	useEffect(() => {
		normalCursorRef.current = normalCursor;
	}, [normalCursor]);

	useEffect(() => {
		hStateRef.current = hState;
	}, [hState]);

	useEffect(() => {
		setTopics(prev => prev.map(item => (item.id === activeTopicId ? { ...hState.topic } : item)));
	}, [hState.topic, activeTopicId]);

	useEffect(() => {
		topicMenuIndexRef.current = topicMenuIndex;
	}, [topicMenuIndex]);

	useEffect(() => {
		if (!isDocumentSwitcherOpen) return;
		const activeIndex = topics.findIndex(item => item.id === activeTopicId);
		const nextIndex = activeIndex >= 0 ? activeIndex : 0;
		setTopicMenuIndex(nextIndex);
		topicMenuIndexRef.current = nextIndex;
		setTopicMenuEditingId(null);
	}, [isDocumentSwitcherOpen, topics, activeTopicId]);

	useEffect(() => {
		if (!isDocumentSwitcherOpen || !topicMenuEditingId) return;
		const focusInput = () => {
			const input = document.querySelector<HTMLInputElement>(
				`[data-testid="topic-title-input-${topicMenuEditingId}"]`
			);
			if (input) {
				input.focus();
				input.select();
				return true;
			}
			return false;
		};
		requestAnimationFrame(() => {
			if (focusInput()) return;
			setTimeout(focusInput, 50);
		});
	}, [isDocumentSwitcherOpen, topicMenuEditingId, topics.length]);

	useEffect(() => {
		if (mode === 'INSERT') {
			if (!insertBaseStateRef.current) {
				insertBaseStateRef.current = hStateRef.current;
			}
			insertDirtyRef.current = false;
			setInsertDirty(false);
		}
	}, [mode]);

	useEffect(() => {
		normalDeletePendingRef.current = normalDeletePending;
	}, [normalDeletePending]);

	useEffect(() => {
		normalChangePendingRef.current = normalChangePending;
	}, [normalChangePending]);

	useEffect(() => {
		normalYankPendingRef.current = normalYankPending;
	}, [normalYankPending]);

	useEffect(() => {
		try {
			localStorage.setItem('engram.showKeyBuffer', String(showKeyBuffer));
		} catch {
			// ignore storage errors
		}
	}, [showKeyBuffer]);

	useEffect(() => {
		document.body.style.overflow = isAccountOpen ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	}, [isAccountOpen]);

	useEffect(() => {
		if (!visualAnchor) return;
		if (visualAnchor.kind === 'text' && mode !== 'NORMAL') setVisualAnchor(null);
		if (visualAnchor.kind === 'block' && mode !== 'BLOCK') setVisualAnchor(null);
	}, [mode, visualAnchor]);

	useEffect(() => {
		if (mode === 'INSERT' && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.setSelectionRange(normalCursor, normalCursor);
		}
	}, [mode, normalCursor]);

	const renderTextWithCursor = (text: string, isFocused: boolean, block: { cursorIdx: number; derivIdx: number }) => {
		const sQuery = isSearching ? searchQuery : lastSearchQuery;
		const hasSearch = !!sQuery;
		const isVisualText =
			!!visualAnchor &&
			visualAnchor.kind === 'text' &&
			visualAnchor.cursorIdx === block.cursorIdx &&
			visualAnchor.derivIdx === block.derivIdx &&
			typeof visualAnchor.charIndex === 'number' &&
			mode === 'NORMAL';
		const visualStart = isVisualText ? Math.min(visualAnchor!.charIndex!, normalCursor) : -1;
		const visualEnd = isVisualText ? Math.max(visualAnchor!.charIndex!, normalCursor) : -1;

		const matchClass = isFocused
			? "bg-[#ff9e64] text-[#1a1b26]"
			: "bg-[#e0af68] text-[#1a1b26]";

		if (mode === 'INSERT') {
			if (hasSearch && sQuery) {
				const regex = new RegExp(`(${sQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
				const parts = text.split(regex);
				return (
					<span>
						{parts.map((part, i) => (
							part.toLowerCase() === sQuery.toLowerCase()
								? <span key={i} className={matchClass}>{part}</span>
								: <span key={i} className={!text && i === 0 ? "opacity-30 italic" : ""}>{part || (text ? "" : "Empty...")}</span>
						))}
						{text.endsWith('\n') && <span className="block">&nbsp;</span>}
					</span>
				);
			}
			return (
				<span className={!text ? "opacity-30 italic" : ""}>
					{text || "Empty..."}
					{text.endsWith('\n') && <span className="block">&nbsp;</span>}
				</span>
			);
		}

		if (mode === 'NORMAL' && isFocused) {
			if (!text) return <span className="char-cursor">&nbsp;</span>;

			const ranges: { start: number, end: number }[] = [];
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
						const isSelected = isVisualText && i >= visualStart && i <= visualEnd;
						let className = "";
						if (isMatch) className += matchClass + " ";
						if (isSelected) className += "bg-[#bb9af7] text-[#1a1b26] ";
						if (i === normalCursor) className += "char-cursor ";

						if (char === '\n' && i === normalCursor) {
							return (
								<span key={i}>
									<span className="char-cursor">&nbsp;</span>
									{char}
								</span>
							);
						}

						return <span key={i} className={className}>{char}</span>;
					})}
					{normalCursor === text.length && !text.endsWith('\n') && <span className="char-cursor">&nbsp;</span>}
					{text.endsWith('\n') && (
						<span className="block">
							{normalCursor === text.length ? <span className="char-cursor">&nbsp;</span> : <span>&nbsp;</span>}
						</span>
					)}
				</span>
			);
		}

		if (hasSearch && sQuery) {
			const regex = new RegExp(`(${sQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
			const parts = text.split(regex);
			return (
				<span>
					{parts.map((part, i) => (
						part.toLowerCase() === sQuery.toLowerCase()
							? <span key={i} className={matchClass}>{part}</span>
							: <span key={i} className={!text && i === 0 ? "opacity-30 italic" : ""}>{part || (text ? "" : "Empty...")}</span>
					))}
					{text.endsWith('\n') && <span className="block">&nbsp;</span>}
				</span>
			);
		}

		if (mode === 'INSERT' && isFocused && !text) {
			return <span className="char-cursor">&nbsp;</span>;
		}
		return (
			<span className={!text ? "opacity-30 italic" : ""}>
				{text || "Empty..."}
				{text.endsWith('\n') && <span className="block">&nbsp;</span>}
			</span>
		);
	};

	const getStatusColor = () => {
		if (visualAnchor) return 'bg-[#bb9af7]';
		if (mode === 'BLOCK') return 'bg-[#7aa2f7]';
		if (mode === 'NORMAL') return 'bg-[#9ece6a]';
		return 'bg-[#ff9e64]';
	};

	const getModeLabel = () => {
		if (visualAnchor) return 'VISUAL';
		if (mode === 'BLOCK') return derivIdx === -1 ? 'BLOCK - CONCEPT' : 'BLOCK - DERIVATIVE';
		return mode;
	};

	const isBlockSelected = (cIdx: number, dIdx: number) => {
		if (!visualAnchor) return false;
		if (visualAnchor.kind !== 'block') return false;
		const items = buildFlatBlocks();
		const anchorIndex = items.findIndex(
			item => item.cursorIdx === visualAnchor.cursorIdx && item.derivIdx === visualAnchor.derivIdx
		);
		const currentIndex = items.findIndex(
			item => item.cursorIdx === cursorIdx && item.derivIdx === derivIdx
		);
		const targetIndex = items.findIndex(item => item.cursorIdx === cIdx && item.derivIdx === dIdx);
		if (anchorIndex === -1 || currentIndex === -1 || targetIndex === -1) return false;
		const [start, end] = anchorIndex <= currentIndex
			? [anchorIndex, currentIndex]
			: [currentIndex, anchorIndex];
		return targetIndex >= start && targetIndex <= end;
	};

	const renderOptions = () => {
		if (visualAnchor) {
			return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="v" description="Exit Visual selection" />
					<LegendItem keys="y" description="Yank the selected blocks" />
					<LegendItem keys="Esc" description="Cancel selection" />
				</div>
			);
		}

		if (keyBuffer === ' ') {
			return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="Space + f" description="Convert all clozes into Anki cards" />
					<LegendItem keys="Space + g" description="AI actions for the current block" />
					<LegendItem keys="Space + a" description="Open topic switcher" />
					<LegendItem keys="Esc" description="Cancel leader chord" />
				</div>
			);
		}

		if (selectionPending) return (
			<div className="flex items-center gap-2">
				<span className="text-[#ff9e64] text-[10px] font-bold">SELECT {selectionPending.type}</span>
				{selectionPending.candidates.map((_, i) => <span key={i} className="px-1.5 py-0.5 border border-[#ff9e64] text-[#ff9e64] rounded text-[10px]">{i + 1}</span>)}
				<span className="text-[10px] opacity-50">ESC Cancel</span>
			</div>
		);

		if (mode === 'INSERT') return (
			<div className="flex flex-col gap-2">
				<LegendItem keys="Esc" description="Return to Normal mode and save changes" />
			</div>
		);

		if (mode === 'NORMAL') {
			return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="Esc" description="Return to Block mode" />
					<LegendItem keys="i" description="Insert before cursor" />
					<LegendItem keys="a" description="Insert after cursor" />
					<LegendItem keys="o / O" description="Open new line below / above" />
					<LegendItem keys="h / j / k / l" description="Move cursor left / down / up / right" />
					<LegendItem keys="w / b / e" description="Jump to next / previous / end of word" />
					<LegendItem keys="v" description="Toggle Visual selection" />
					<LegendItem keys="y" description="Yank (copy) the current block/selection" />
					<LegendItem keys="p" description="Paste the yanked content below" />
					<LegendItem keys="d" description="Delete: dw / de / db / dd" />
					<LegendItem keys="c" description="Change: cw / ce / cb / cc" />
					<LegendItem keys="Space" description="More actions..." />
					<LegendItem keys="/" description="Search within concepts and derivatives" />
					<LegendItem keys="n / N" description="Next / previous search match" />
					<LegendItem keys="u" description="Undo last change" />
					<LegendItem keys="r" description="Redo last undo" />
				</div>
			);
		}

		if (mode === 'BLOCK') {
			if (keyBuffer === 'o') return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="o p" description="Add a new probing question" />
					<LegendItem keys="o c" description="Add a new cloze deletion" />
					<LegendItem keys="o e" description="Add an elaboration" />
					<LegendItem keys="Esc" description="Cancel add chord" />
				</div>
			);
			if (keyBuffer === 'd') return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="d d" description="Delete the focused item" />
					<LegendItem keys="d p" description="Delete a probing question" />
					<LegendItem keys="d c" description="Delete a cloze deletion" />
					<LegendItem keys="Esc" description="Cancel delete chord" />
				</div>
			);
			if (keyBuffer === 'c') return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="c c" description="Change the focused item" />
					<LegendItem keys="c p" description="Change a probing question" />
					<LegendItem keys="c l" description="Change a cloze deletion" />
					<LegendItem keys="Esc" description="Cancel change chord" />
				</div>
			);

			return (
				<div className="flex flex-col gap-2">
					<LegendItem keys="j / k" description="Move focus to next / previous item" />
					<LegendItem keys="h / l" description="Move between concept and derivatives" />
					<LegendItem keys="i / a" description="Enter Normal mode at start / end" />
					<LegendItem keys="o / O" description="Add a new concept below / above" />
					<LegendItem keys="v" description="Toggle Visual selection" />
					<LegendItem keys="y" description="Yank (copy) the current block/selection" />
					<LegendItem keys="p" description="Paste the yanked content below" />
					<LegendItem keys="d" description="Begin delete chord" />
					<LegendItem keys="c" description="Begin change chord" />
					<LegendItem keys="Space" description="More actions..." />
					<LegendItem keys="/" description="Search across the topic" />
				</div>
			);
		}
		return null;
	};

	const isFocusMode = mode === 'NORMAL' || mode === 'INSERT';

	return (
		<div className="flex flex-col h-screen overflow-hidden font-sans">
			<div className="p-4 flex justify-between items-center z-10 h-16 absolute top-0 left-0 right-0">
				<div className="flex items-center gap-3">
					<img
						src="/logo.svg"
						alt="Engram"
						className="w-24 h-6 object-contain"
					/>
					<h1
						className="text-sm font-bold text-[#c0caf5] drop-shadow-[0_0_12px_rgba(26,27,38,0.9)]"
						data-testid="topic-title"
					>
						{topic.title}
					</h1>
				</div>

				<div className="flex items-center gap-3 justify-end min-w-[120px]">
					<div className="flex gap-2 items-center">
						<button
							className="h-8 w-8 rounded-full border border-[#2a2f45] bg-[#1f2335] text-[10px] font-bold text-[#c0caf5] shadow-md hover:border-[#7aa2f7]/60 hover:bg-[#24283b] transition"
							onClick={() => setIsAccountOpen(true)}
							aria-label="Open account settings"
						>
							{user?.image ? (
								<img src={user.image} alt={userName} className="h-full w-full rounded-full object-cover" />
							) : (
								<span>{initials}</span>
							)}
						</button>
					</div>
				</div>
			</div>

			{showKeyBuffer && (
				<div className="fixed right-6 top-24 z-20 max-w-[280px]">
					<div className="rounded-xl border border-[#2b324a] bg-[#151a26]/90 px-3 py-2 shadow-[0_0_18px_rgba(10,12,20,0.85)] backdrop-blur">
						{renderOptions()}
					</div>
				</div>
			)}

			<div className="flex-1 overflow-y-auto p-8 pt-24 relative">
				<div className="max-w-3xl mx-auto pb-20 space-y-6">
					{topic.concepts.map((concept, cIdx) => {
						const isConceptActive = cursorIdx === cIdx && derivIdx === -1;
						const conceptOpacity = isFocusMode && !isConceptActive ? 'opacity-20 grayscale transition-all duration-300' : 'opacity-100 transition-all duration-300';
						const isConceptSelected = isBlockSelected(cIdx, -1);

						return (
							<div
								key={concept.id}
								ref={cursorIdx === cIdx && derivIdx === -1 ? activeRef : null}
								className={`p-4 rounded transition-all duration-100 relative
											 border bg-[#24283b]
											 ${cursorIdx === cIdx && derivIdx === -1 && mode === 'BLOCK'
											? 'border-[#7aa2f7] ring-1 ring-[#7aa2f7] shadow-[0_0_20px_rgba(122,162,247,0.1)]'
											: 'border-[#7aa2f7]/20'}
										 ${isConceptSelected ? 'ring-2 ring-[#bb9af7] bg-[#2a1f3d]/40 border-[#bb9af7]/40' : ''}
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
																setCursor(e.target.selectionStart);
												}}
															onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
												className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#ff9e64] outline-none resize-none overflow-hidden z-10 font-mono text-lg leading-relaxed"
												spellCheck={false}
											/>
										)}
										<div
											className="break-words whitespace-pre-wrap min-h-[1.5em] text-[#c0caf5]"
											style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
											data-testid={`concept-text-${cIdx}`}
										>
												{renderTextWithCursor(concept.text, cursorIdx === cIdx && derivIdx === -1, { cursorIdx: cIdx, derivIdx: -1 })}
										</div>
									</div>
								</div>

								<div className="ml-10 mt-4 pl-4 border-l border-[#565f89]/30 space-y-3">
									{concept.derivatives.map((deriv, dIdx) => {
										const isCandidate = selectionPending && selectionPending.candidates.some(c => c.id === deriv.id) && selectionPending.candidates[0].type === deriv.type && cursorIdx === cIdx;
										const candidateIndex = isCandidate ? selectionPending.candidates.findIndex(c => c.id === deriv.id) + 1 : null;
										const isProbing = deriv.type === 'PROBING';
										const isElaboration = deriv.type === 'ELABORATION';
										const isDerivActive = cursorIdx === cIdx && derivIdx === dIdx;
										const derivOpacity = isFocusMode && !isDerivActive ? 'opacity-20 grayscale transition-all duration-300' : 'opacity-100 transition-all duration-300';
										const isDerivSelected = isBlockSelected(cIdx, dIdx);

										const borderColor = isProbing
											? 'border-[#ff9e64]/30'
											: isElaboration
												? 'border-[#7dcfff]/30'
												: 'border-[#bb9af7]/30';
										const bgColor = isProbing
											? 'bg-[#ff9e64]/10'
											: isElaboration
												? 'bg-[#7dcfff]/10'
												: 'bg-[#bb9af7]/10';
										const focusRing = isProbing
											? 'ring-[#ff9e64]'
											: isElaboration
												? 'ring-[#7dcfff]'
												: 'ring-[#bb9af7]';
										const badgeBg = isProbing
											? 'bg-[#ff9e64]/20'
											: isElaboration
												? 'bg-[#7dcfff]/20'
												: 'bg-[#bb9af7]/20';
										const badgeText = isProbing
											? 'text-[#ff9e64]'
											: isElaboration
												? 'text-[#7dcfff]'
												: 'text-[#bb9af7]';

										return (
											<div
												key={deriv.id}
												ref={cursorIdx === cIdx && derivIdx === dIdx ? activeRef : null}
												data-derivative-type={deriv.type}
												className={`p-3 rounded relative transition-all duration-100 border ${borderColor} ${bgColor} ${derivOpacity}
																${cursorIdx === cIdx && derivIdx === dIdx && mode === 'BLOCK' ? `ring-1 ${focusRing} shadow-[0_0_15px_rgba(0,0,0,0.3)]` : ''}
														${isDerivSelected ? 'ring-2 ring-[#bb9af7] border-[#bb9af7]/50 bg-[#2a1f3d]/35' : ''}
														`}
											>
												<div className="flex items-start gap-3">
													<span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider mt-0.5 ${badgeBg} ${badgeText}`}>
														{isProbing ? '?' : isElaboration ? 'E' : 'C'}
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
																	setCursor(e.target.selectionStart);
																}}
																onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
																className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#ff9e64] outline-none resize-none overflow-hidden z-10 font-mono text-sm"
																spellCheck={false}
															/>
														)}
														<div
															className="break-words whitespace-pre-wrap min-h-[1.5em] text-[#a9b1d6]"
															style={{
																overflowWrap: 'anywhere',
																wordBreak: 'break-word',
																overflow: isElaboration && mode === 'BLOCK' && cursorIdx !== cIdx ? 'hidden' : 'visible',
																display: isElaboration && mode === 'BLOCK' && cursorIdx !== cIdx ? '-webkit-box' : 'block',
																WebkitLineClamp: isElaboration && mode === 'BLOCK' && cursorIdx !== cIdx ? 3 : 'unset',
																WebkitBoxOrient: isElaboration && mode === 'BLOCK' && cursorIdx !== cIdx ? 'vertical' : 'unset'
															}}
															data-testid={`derivative-text-${cIdx}-${dIdx}`}
														>
															{renderTextWithCursor(
																deriv.text,
																cursorIdx === cIdx && derivIdx === dIdx,
																{ cursorIdx: cIdx, derivIdx: dIdx }
															)}
														</div>
													</div>
												</div>
											</div>
										);
									})}

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

			{showKeyBuffer && keyBuffer && (
				<div
					style={{ position: 'fixed', right: 24, top: 168, zIndex: 40 }}
				>
					<div className="px-3 py-2 rounded-lg border border-[#2a2f45] bg-[#1f2335]/90 text-[10px] font-bold tracking-wider text-[#c0caf5] shadow-[0_0_18px_rgba(26,27,38,0.95)]">
						CHORD: {keyBuffer}
					</div>
				</div>
			)}

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

			{isAccountOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e17]/80">
					<div className="w-[min(920px,92vw)] max-h-[85vh] overflow-hidden rounded-2xl border border-[#22283a] bg-[#141821] shadow-[0_30px_80px_rgba(6,8,14,0.65)]">
						<div className="flex items-center justify-between border-b border-[#1f2536] bg-[#171c28] px-5 py-4">
							<div className="flex items-center gap-3">
								<img src="/logo.svg" alt="Engram" className="w-20 h-5 object-contain" />
								<div>
									<div className="text-[11px] font-bold tracking-[0.2em] text-[#cbd3f2]">ACCOUNT</div>
									<div className="text-[10px] text-[#94a0c6]">Manage your profile & security</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<button
									className="text-[10px] font-bold px-2 py-1 rounded border border-[#5b79d6]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
									onClick={() => setIsAccountOpen(false)}
								>
									CLOSE
								</button>
								<button
									className="text-[10px] font-bold px-2 py-1 rounded border border-[#f27a93]/40 text-[#ff9aaa] hover:bg-[#f27a93]/15 transition"
									onClick={async () => {
										try {
											await authClient.signOut({ fetchOptions: { throw: true } });
										} finally {
											setIsAccountOpen(false);
											window.location.href = '/auth/sign-in';
										}
									}}
								>
									SIGN OUT
								</button>
							</div>
						</div>
						<div className="max-h-[calc(85vh-64px)] overflow-y-auto p-5 space-y-5">
							<div className="rounded-xl border border-[#22283a] bg-[#161b27] p-4">
								<div className="text-[11px] font-bold tracking-[0.2em] text-[#cbd3f2]">PROFILE</div>
								<div className="mt-4 grid gap-4 md:grid-cols-[140px_1fr]">
									<div className="flex flex-col items-start gap-3">
										<div className="h-16 w-16 rounded-full border border-[#283049] bg-[#101521] overflow-hidden">
											{user?.image ? (
												<img src={user.image} alt={userName} className="h-full w-full object-cover" />
											) : (
												<div className="h-full w-full flex items-center justify-center text-sm font-bold text-[#9bb2ff]">
													{initials}
												</div>
											)}
										</div>
										<div className="flex flex-col gap-2">
											<label className="text-[10px] uppercase tracking-[0.2em] text-[#7f8bb4]">Avatar</label>
											<div className="flex items-center gap-2">
												<input
													id="avatar-upload"
													type="file"
													accept="image/*"
													className="hidden"
													onChange={async (e) => {
														const file = e.target.files?.[0];
														if (!file) return;
														setAvatarStatus({ type: 'saving' });
														try {
															const dataUrl = await new Promise<string>((resolve, reject) => {
																const reader = new FileReader();
																reader.onload = () => resolve(String(reader.result));
																reader.onerror = () => reject(new Error('Avatar upload failed.'));
																reader.readAsDataURL(file);
															});
															await authClient.updateUser({ image: dataUrl, fetchOptions: { throw: true } });
															await refreshSession();
															setAvatarStatus({ type: 'success', message: 'Avatar updated.' });
														} catch (error: any) {
															setAvatarStatus({ type: 'error', message: error?.message || 'Failed to update avatar.' });
														} finally {
															e.target.value = '';
														}
													}} />
												<button
													className="text-[10px] font-bold px-2.5 py-1 rounded border border-[#2a3350] text-[#9bb2ff] hover:bg-[#2a3350]/30 transition"
													onClick={() => document.getElementById('avatar-upload')?.click()}
													disabled={avatarStatus.type === 'saving'}
												>
													Upload
												</button>
												{user?.image && (
													<button
														className="text-[10px] font-bold px-2.5 py-1 rounded border border-[#3a2530] text-[#ff9aaa] hover:bg-[#3a2530]/40 transition"
														onClick={async () => {
															setAvatarStatus({ type: 'saving' });
															try {
																await authClient.updateUser({ image: null, fetchOptions: { throw: true } });
																await refreshSession();
																setAvatarStatus({ type: 'success', message: 'Avatar removed.' });
															} catch (error: any) {
																setAvatarStatus({ type: 'error', message: error?.message || 'Failed to remove avatar.' });
															}
														}}
														disabled={avatarStatus.type === 'saving'}
													>
														Remove
													</button>
												)}
											</div>
											{avatarStatus.message && (
												<div className={`text-[10px] ${avatarStatus.type === 'error' ? 'text-[#ff9aaa]' : 'text-[#9ece6a]'}`}>
													{avatarStatus.message}
												</div>
											)}
										</div>
									</div>
									<div className="space-y-3">
										<div>
											<label className="text-[10px] uppercase tracking-[0.2em] text-[#7f8bb4]">Name</label>
											<input
												value={profileForm.name}
												onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
												className="mt-1 w-full rounded-lg border border-[#283049] bg-[#101521] px-3 py-2 text-[12px] text-[#cbd3f2] outline-none focus:border-[#5b79d6]/70"
												placeholder="Your name"
											/>
										</div>
										<div>
											<label className="text-[10px] uppercase tracking-[0.2em] text-[#7f8bb4]">Email</label>
											<input
												type="email"
												value={profileForm.email}
												onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
												className="mt-1 w-full rounded-lg border border-[#283049] bg-[#101521] px-3 py-2 text-[12px] text-[#cbd3f2] outline-none focus:border-[#5b79d6]/70"
												placeholder="you@example.com"
											/>
										</div>
										<div className="flex items-center gap-3">
											<button
												className="text-[10px] font-bold px-3 py-1.5 rounded border border-[#2a3350] text-[#9bb2ff] hover:bg-[#2a3350]/30 transition"
												onClick={async () => {
													setProfileStatus({ type: 'saving' });
													try {
														const updates: Record<string, string> = {};
														const nextName = profileForm.name.trim();
														const nextEmail = profileForm.email.trim();
														if (nextName && nextName !== user?.name && nextName !== user?.displayName) updates.name = nextName;
														if (nextEmail && nextEmail !== user?.email) updates.email = nextEmail;
														if (Object.keys(updates).length === 0) {
															setProfileStatus({ type: 'error', message: 'No changes to save.' });
															return;
														}
														await authClient.updateUser({ ...updates, fetchOptions: { throw: true } });
														await refreshSession();
														setProfileStatus({ type: 'success', message: 'Profile updated.' });
													} catch (error: any) {
														setProfileStatus({ type: 'error', message: error?.message || 'Failed to update profile.' });
													}
												}}
												disabled={profileStatus.type === 'saving'}
											>
												Save profile
											</button>
											{profileStatus.message && (
												<span className={`text-[10px] ${profileStatus.type === 'error' ? 'text-[#ff9aaa]' : 'text-[#9ece6a]'}`}>
													{profileStatus.message}
												</span>
											)}
										</div>
									</div>
								</div>
							</div>

							<div className="rounded-xl border border-[#22283a] bg-[#161b27] p-4">
								<div className="text-[11px] font-bold tracking-[0.2em] text-[#cbd3f2]">SECURITY</div>
								<div className="mt-4 space-y-3">
									<div>
										<label className="text-[10px] uppercase tracking-[0.2em] text-[#7f8bb4]">Current password</label>
										<input
											type="password"
											value={passwordForm.currentPassword}
											onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
											className="mt-1 w-full rounded-lg border border-[#283049] bg-[#101521] px-3 py-2 text-[12px] text-[#cbd3f2] outline-none focus:border-[#5b79d6]/70"
											placeholder="••••••••"
										/>
									</div>
									<div>
										<label className="text-[10px] uppercase tracking-[0.2em] text-[#7f8bb4]">New password</label>
										<input
											type="password"
											value={passwordForm.newPassword}
											onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
											className="mt-1 w-full rounded-lg border border-[#283049] bg-[#101521] px-3 py-2 text-[12px] text-[#cbd3f2] outline-none focus:border-[#5b79d6]/70"
											placeholder="At least 8 characters"
										/>
									</div>
									<div>
										<label className="text-[10px] uppercase tracking-[0.2em] text-[#7f8bb4]">Confirm new password</label>
										<input
											type="password"
											value={passwordForm.confirmPassword}
											onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
											className="mt-1 w-full rounded-lg border border-[#283049] bg-[#101521] px-3 py-2 text-[12px] text-[#cbd3f2] outline-none focus:border-[#5b79d6]/70"
											placeholder="Repeat new password"
										/>
									</div>
									<div className="flex items-center gap-3">
										<button
											className="text-[10px] font-bold px-3 py-1.5 rounded border border-[#2a3350] text-[#9bb2ff] hover:bg-[#2a3350]/30 transition"
											onClick={async () => {
												setPasswordStatus({ type: 'saving' });
												if (!passwordForm.newPassword || passwordForm.newPassword.length < 8) {
													setPasswordStatus({ type: 'error', message: 'New password must be at least 8 characters.' });
													return;
												}
												if (passwordForm.newPassword !== passwordForm.confirmPassword) {
													setPasswordStatus({ type: 'error', message: 'Passwords do not match.' });
													return;
												}
												try {
													await authClient.changePassword({
														currentPassword: passwordForm.currentPassword,
														newPassword: passwordForm.newPassword,
														revokeOtherSessions: true,
														fetchOptions: { throw: true }
													});
													setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
													setPasswordStatus({ type: 'success', message: 'Password updated.' });
												} catch (error: any) {
													setPasswordStatus({ type: 'error', message: error?.message || 'Failed to update password.' });
												}
											}}
											disabled={passwordStatus.type === 'saving'}
										>
											Update password
										</button>
										{passwordStatus.message && (
											<span className={`text-[10px] ${passwordStatus.type === 'error' ? 'text-[#ff9aaa]' : 'text-[#9ece6a]'}`}>
												{passwordStatus.message}
											</span>
										)}
									</div>
								</div>
							</div>

							<div className="rounded-xl border border-[#22283a] bg-[#161b27] p-4">
								<div className="text-[11px] font-bold tracking-[0.2em] text-[#cbd3f2]">DISPLAY</div>
								<div className="mt-2 flex items-center justify-between">
									<div>
										<div className="text-[10px] font-bold text-[#cbd3f2]">Keybuffer legend</div>
										<div className="text-[10px] text-[#94a0c6]">Show the chord helper on the right</div>
									</div>
									<button
										className={`text-[10px] font-bold px-2 py-1 rounded border transition ${showKeyBuffer ? 'border-[#5b79d6]/50 text-[#9bb2ff] hover:bg-[#5b79d6]/15' : 'border-[#262c3f] text-[#94a0c6] hover:bg-[#1f2536]'}`}
										onClick={() => setShowKeyBuffer(prev => !prev)}
									>
										{showKeyBuffer ? 'ON' : 'OFF'}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{isDocumentSwitcherOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e17]/80" data-testid="topic-switcher">
					<div className="w-[min(560px,90vw)] rounded-2xl border border-[#22283a] bg-[#141821] shadow-[0_30px_80px_rgba(6,8,14,0.65)]">
						<div className="flex items-center justify-between border-b border-[#1f2536] bg-[#171c28] px-5 py-4">
							<div>
								<div className="text-[11px] font-bold tracking-[0.2em] text-[#cbd3f2]">TOPICS</div>
								<div className="text-[10px] text-[#94a0c6]">Choose a topic to open</div>
							</div>
							<button
								className="text-[10px] font-bold px-2 py-1 rounded border border-[#5b79d6]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
								data-testid="topic-close"
								onClick={() => { setIsDocumentSwitcherOpen(false); setTopicMenuEditingId(null); }}
							>
								CLOSE
							</button>
						</div>
						<div className="p-5 space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<div className="text-[10px] font-bold text-[#cbd3f2]">Current topic</div>
									<div className="mt-1 text-[12px] text-[#94a0c6]">{topic.title}</div>
								</div>
								<button
									className="text-[10px] font-bold px-2 py-1 rounded border border-[#7aa2f7]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
									data-testid="topic-create"
									onClick={createTopic}
								>
									NEW TOPIC
								</button>
							</div>
							<div className="rounded-lg border border-[#22283a] bg-[#161b27] px-3 py-2 text-[10px] text-[#94a0c6]">
								{topicMenuEditingId ? (
									<span><span className="font-bold text-[#cbd3f2]">Editing:</span> Esc finish, Enter open</span>
								) : (
									<span><span className="font-bold text-[#cbd3f2]">Keys:</span> j/k move, o new, c rename, Enter/l open, d delete, Esc close</span>
								)}
							</div>
							<div className="space-y-2" data-testid="topic-list">
								{topics.map((item, index) => (
									<div
										key={item.id}
										data-testid={`topic-item-${item.id}`}
										data-selected={topics[topicMenuIndex]?.id === item.id}
										className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${item.id === activeTopicId ? 'border-[#7aa2f7]/60 bg-[#1b2131]' : 'border-[#22283a] bg-[#161b27]'} ${topics[topicMenuIndex]?.id === item.id ? 'ring-1 ring-[#ff9e64] shadow-[0_0_10px_rgba(255,158,100,0.3)]' : ''}`}
									>
										<input
											className="flex-1 bg-transparent text-[12px] text-[#c0caf5] outline-none"
											value={topicDrafts[item.id] ?? item.title}
											data-testid={`topic-title-input-${item.id}`}
											autoFocus={item.id === topicMenuEditingId}
											onChange={(e) => renameTopic(item.id, e.target.value)}
											onFocus={() => { setTopicMenuEditingId(item.id); setTopicMenuIndex(index); }}
											onBlur={() => setTopicMenuEditingId(prev => (prev === item.id ? null : prev))}
											onKeyDown={(e) => {
												if (e.key === 'Escape') {
													e.preventDefault();
													setTopicMenuEditingId(null);
													(e.currentTarget as HTMLInputElement).blur();
													return;
												}
												if (e.key === 'Enter') {
													e.preventDefault();
													openTopic(item.id);
												}
											}}
											placeholder="Untitled Topic"
										/>
										<button
											className="text-[10px] font-bold px-2 py-1 rounded border border-[#5b79d6]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
											data-testid={`topic-open-${item.id}`}
											onClick={() => openTopic(item.id)}
										>
											OPEN
										</button>
										<button
											className="text-[10px] font-bold px-2 py-1 rounded border border-[#f27a93]/40 text-[#ff9aaa] hover:bg-[#f27a93]/15 transition"
											data-testid={`topic-delete-${item.id}`}
											onClick={() => deleteTopic(item.id)}
										>
											DELETE
										</button>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default App;
