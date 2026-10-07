import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Speech to text with the browser's own Web Speech API (Chrome, Edge and Safari have it; Firefox does not).
// One utterance at a time: the person taps the mic, speaks, pauses, and the words are in the input to check and send.
// The API is not in TypeScript's DOM types, so the small part used here is declared below.

interface Alternative {
  transcript: string;
}
interface Result {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: Alternative;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: { results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Plain-English reason a recording did not work. Empty when there is nothing worth saying (the person stopped it). */
export function speechProblem(error: string): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return "I can't use the microphone. Allow it in your browser's settings, or type instead.";
    case 'no-speech':
      return "I didn't hear anything. Tap the mic and try again, or type it.";
    case 'audio-capture':
      return "I can't find a microphone. You can type instead.";
    case 'network':
      return "Voice isn't available right now. You can type instead.";
    case 'aborted':
      return '';
    default:
      return "Voice didn't work that time. You can type instead.";
  }
}

/**
 * `onText` gets everything heard so far in this utterance (interim, then final), so the caller can show it live.
 * `supported` is false where the browser has no speech recognition: hide the mic button then.
 */
export function useSpeech(onText: (heard: string, final: boolean) => void) {
  const supported = useMemo(() => !!recognitionCtor(), []);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState('');
  const rec = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;

  const stop = useCallback(() => rec.current?.stop(), []);

  /** Stops and throws away anything still being recognised (the person sent the message instead of waiting). */
  const cancel = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    rec.current = null;
    setListening(false);
    r.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || rec.current) return;
    setProblem('');
    const r = new Ctor();
    r.lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? navigator.language : 'en-US';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0]?.transcript ?? '');
      callback.current(parts.join('').trim(), !!e.results[e.results.length - 1]?.isFinal);
    };
    r.onerror = (e) => setProblem(speechProblem(e.error));
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      rec.current = null;
      setProblem(speechProblem('other'));
    }
  }, []);

  useEffect(
    () => () => {
      const r = rec.current;
      if (r) {
        r.onend = null;
        r.onresult = null;
        r.onerror = null;
        r.abort();
      }
    },
    [],
  );

  return { supported, listening, problem, start, stop, cancel };
}
