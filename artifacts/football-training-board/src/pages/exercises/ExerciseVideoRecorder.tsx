import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Play, Square, Trash2, Video } from "lucide-react";

interface Props {
  value?: string | null;
  onChange: (data: string | null) => void;
  readOnly?: boolean;
}

export function ExerciseVideoRecorder({ value, onChange, readOnly = false }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function cleanupLiveStream() {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => track.stop());
      liveStreamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    return () => {
      cleanupLiveStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    setProcessing(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      liveStreamRef.current = stream;

      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.muted = true;
        previewRef.current.playsInline = true;
        await previewRef.current.play().catch(() => {});
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm;codecs=vp8,opus";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        setProcessing(true);
        cleanupLiveStream();

        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          onChange(reader.result as string);
          setProcessing(false);
        };
        reader.readAsDataURL(blob);

        if (timerRef.current) clearInterval(timerRef.current);
        setSeconds(0);
        setRecording(false);
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev >= 119) {
            recorder.stop();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      cleanupLiveStream();
      setError("Camera o microfono non disponibili. Controlla i permessi del browser.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function deleteVideo() {
    onChange(null);
  }

  if (readOnly) {
    if (!value) return <p className="text-sm text-muted-foreground italic">Nessuna nota video</p>;
    return (
      <div className="space-y-2">
        <video src={value} controls playsInline className="w-full rounded-lg border bg-black/30 max-h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!value ? (
        <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
          {recording ? (
            <>
              <div className="flex items-center gap-2 text-destructive">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                <span className="font-mono text-sm font-medium">{formatTime(seconds)}</span>
                <span className="text-xs text-muted-foreground">/ 2:00 max</span>
              </div>
              <video ref={previewRef} autoPlay muted playsInline className="w-full rounded-lg border bg-black/40 max-h-64 object-cover" />
              <Button type="button" size="sm" variant="destructive" className="gap-1.5" onClick={stopRecording}>
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={startRecording} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-primary" />}
              Registra nota video
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/20">
          <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
            <Video className="h-4 w-4" />
            Nota video registrata
          </div>
          <video src={value} controls playsInline className="w-full rounded-lg border bg-black/40 max-h-64" />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={startRecording} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              Registra di nuovo
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={deleteVideo}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
