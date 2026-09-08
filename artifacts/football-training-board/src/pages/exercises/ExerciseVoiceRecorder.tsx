import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Play, Square, Trash2, Upload } from "lucide-react";

interface Props {
  value?: string | null;
  onChange: (data: string | null) => void;
  readOnly?: boolean;
}

export function ExerciseVoiceRecorder({ value, onChange, readOnly = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duration of saved audio (seconds)
  const [savedDuration, setSavedDuration] = useState<number | null>(null);

  useEffect(() => {
    // Compute duration of saved audio if any
    if (value) {
      const audio = new Audio(value);
      audio.addEventListener("loadedmetadata", () => {
        if (isFinite(audio.duration)) setSavedDuration(Math.round(audio.duration));
      });
    } else {
      setSavedDuration(null);
    }
  }, [value]);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Registrazione non supportata da questo dispositivo o browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          onChange(reader.result as string);
        };
        reader.readAsDataURL(blob);
        clearInterval(timerRef.current!);
        setSeconds(0);
        setRecording(false);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => {
        if (s >= 179) { mr.stop(); return s; } // max 3 min
        return s + 1;
      }), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message ? `Microfono non disponibile: ${message}` : "Microfono non disponibile. Controlla i permessi dell'app.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function playAudio() {
    if (!value) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(value);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.play();
    setPlaying(true);
  }

  function deleteAudio() {
    audioRef.current?.pause();
    setPlaying(false);
    onChange(null);
  }

  function uploadAudioFile(file?: File | null) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("audio/")) {
      setError("Seleziona un file audio valido.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => onChange(String(reader.result ?? ""));
    reader.onerror = () => setError("Caricamento del file audio non riuscito.");
    reader.readAsDataURL(file);
  }

  if (readOnly) {
    if (!value) return <p className="text-sm text-muted-foreground italic">Nessuna nota vocale</p>;
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
        <Button type="button" size="sm" variant="outline" onClick={playAudio} className="gap-2">
          {playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? "Stop" : "Riproduci"}
        </Button>
        {savedDuration !== null && (
          <span className="text-xs text-muted-foreground">{formatTime(savedDuration)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!value ? (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-muted/20 border border-dashed sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              uploadAudioFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          {recording ? (
            <>
              <div className="flex items-center gap-2 text-destructive">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm font-mono font-medium">{formatTime(seconds)}</span>
                <span className="text-xs text-muted-foreground">/ 3:00 max</span>
              </div>
              <Button type="button" size="sm" variant="destructive" onClick={stopRecording} className="gap-1.5 ml-auto">
                <Square className="w-3.5 h-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={startRecording} className="gap-2">
                <Mic className="w-4 h-4 text-destructive" />
                Registra nota vocale
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="w-4 h-4" />
                Carica file audio
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <Mic className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-400 font-medium">
            Nota vocale registrata{savedDuration !== null ? ` — ${formatTime(savedDuration)}` : ""}
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <Button type="button" size="sm" variant="ghost" onClick={playAudio} className="gap-1.5 h-8 px-2">
              {playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? "Stop" : "Play"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                uploadAudioFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} title="Sostituisci con file audio">
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={deleteAudio}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
