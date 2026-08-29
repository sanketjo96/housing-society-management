import { useMutation } from '@tanstack/react-query';
import { Mic, Phone, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ErrorBanner, Field, inputClass } from '../../components/form-field/FormField';
import { authedFetch } from '../../lib/api';

interface VehicleSearchResult {
  found: boolean;
  wing?: string;
  flatNumber?: string;
  occupantName?: string;
  occupantPhone?: string | null;
}

async function searchVehicle(plate: string): Promise<VehicleSearchResult> {
  const res = await authedFetch(`/api/vehicles/search?plate=${encodeURIComponent(plate)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? 'Could not search for that plate.');
  return body;
}

// Not yet in TS's lib.dom — declare the pieces of the Web Speech API we use.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Some browsers (notably iOS Safari) expose the constructor but fail at
// start() — e.g. the mic permission prompt is blocked, or the OS-level
// dictation feature is off — so the failure reason matters more than usual.
function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked for this site. Check your browser/device Settings for a microphone permission, then try again.';
    case 'no-speech':
      return "Didn't catch that — try again.";
    case 'audio-capture':
      return 'No microphone was found on this device.';
    case 'network':
      return 'Voice search needs an internet connection.';
    case 'language-not-supported':
      return "This device doesn't support voice search in this language.";
    default:
      return `Voice search failed (${code}). Try again, or type the plate instead.`;
  }
}

export function VehicleFinderPage() {
  const [plate, setPlate] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mutation = useMutation<VehicleSearchResult, Error, string>({ mutationFn: searchVehicle });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Not vendor-prefixed in every supporting browser, so only Chrome/Safari/Edge
  // get the mic button — Firefox has no Web Speech API at all.
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function runSearch(value: string) {
    const trimmed = value.trim();
    if (trimmed) mutation.mutate(trimmed);
  }

  function startListening() {
    if (!SpeechRecognitionCtor) return;
    setVoiceError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      // Plates are read out letter/digit by letter/digit — collapse the
      // recognizer's spaced-out transcript into a single plate string.
      const transcript = event.results[0][0].transcript.replace(/\s+/g, '').toUpperCase();
      setPlate(transcript);
      runSearch(transcript);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setVoiceError(describeSpeechError(event.error));
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="m-0 mb-1 font-display text-xl text-ink">Vehicle Finder</h1>
      <p className="m-0 mb-6 text-xs text-muted">
        Look up a parked vehicle's plate number to find which flat it belongs to.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(plate);
        }}
        noValidate
        className="mb-6 rounded-2xl border border-line bg-white p-6"
      >
        <Field label="Plate number">
          <div className="flex items-center gap-2">
            <input
              aria-label="Plate number"
              className={inputClass}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="e.g. MH12AB1234"
            />
            {SpeechRecognitionCtor && (
              <button
                type="button"
                aria-label={listening ? 'Listening…' : 'Search by voice'}
                onClick={startListening}
                disabled={listening}
                className={`flex shrink-0 items-center justify-center rounded-lg border border-line p-2.5 disabled:cursor-default ${
                  listening ? 'text-coral' : 'text-muted'
                }`}
              >
                <Mic size={16} />
              </button>
            )}
          </div>
        </Field>
        {voiceError && <ErrorBanner>{voiceError}</ErrorBanner>}
        <button
          type="submit"
          disabled={mutation.isPending || !plate.trim()}
          className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          <Search size={14} /> {mutation.isPending ? 'Searching…' : 'Search'}
        </button>
        {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}
      </form>

      {mutation.data &&
        (mutation.data.found ? (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Match found</p>
            <p className="m-0 font-display text-lg text-ink">
              Flat {mutation.data.wing}-{mutation.data.flatNumber}
            </p>
            <p className="m-0 mt-2 text-sm text-ink">{mutation.data.occupantName}</p>
            {mutation.data.occupantPhone && (
              // tel: link — on mobile this opens the dialer directly, since the
              // whole point of a match here is "call them right now," not just
              // display their number.
              <a
                href={`tel:${mutation.data.occupantPhone}`}
                className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal"
              >
                <Phone size={14} /> {mutation.data.occupantPhone}
              </a>
            )}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted">
            No vehicle found for that plate.
          </p>
        ))}
    </div>
  );
}
