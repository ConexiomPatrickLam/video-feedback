'use client';

import { useRef, useState } from 'react';

type Status = 'idle' | 'recording' | 'uploading' | 'done' | 'error';

const FRAME_INTERVAL_MS = 2000; // grab a frame every 2s
const MAX_FRAMES = 8;           // cap payload size
const FRAME_WIDTH = 800;        // downscale so frames stay small

export default function FeedbackRecorder() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Screen share (video) and mic (voice narration) are captured separately,
  // then merged into one stream for MediaRecorder — kept as separate refs so
  // each can be stopped independently and the mic can fail without blocking
  // the recording.
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Mirror the note in a ref: uploadRecording is bound to mediaRecorder.onstop at
  // record-start, so reading `note` from state there would be stale.
  const noteRef = useRef('');

  // Hidden <video>+<canvas> mirror the screen-share stream (video only — no
  // need for the mic track here), so we can grab periodic screenshots
  // alongside the recording.
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<{ timestampMs: number; dataUrl: string }[]>([]);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef(0);

  async function startRecording() {
    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch {
      // user canceled the browser's share picker, or permission was denied
      return;
    }

    // Voice narration is optional — if the mic prompt is denied or unavailable,
    // fall back to a video-only recording rather than blocking the flow.
    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      micStream = null;
    }

    displayStreamRef.current = displayStream;
    micStreamRef.current = micStream;
    chunksRef.current = [];
    framesRef.current = [];

    const videoEl = videoElRef.current!;
    videoEl.srcObject = displayStream;
    await videoEl.play();

    recordingStartRef.current = Date.now();
    frameIntervalRef.current = setInterval(captureFrame, FRAME_INTERVAL_MS);

    const recordingStream = micStream
      ? new MediaStream([...displayStream.getVideoTracks(), ...micStream.getAudioTracks()])
      : displayStream;
    const mimeType = micStream ? 'video/webm;codecs=vp9,opus' : 'video/webm;codecs=vp9';

    const mediaRecorder = new MediaRecorder(recordingStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = uploadRecording;
    mediaRecorderRef.current = mediaRecorder;

    // stop automatically if the user ends sharing via the browser's own UI
    displayStream.getVideoTracks()[0].addEventListener('ended', stopRecording);

    mediaRecorder.start();
    setResult(null);
    setStatus('recording');
  }

  function captureFrame() {
    if (framesRef.current.length >= MAX_FRAMES) return;

    const videoEl = videoElRef.current!;
    const canvas = canvasRef.current!;
    if (!videoEl.videoWidth) return;

    const scale = FRAME_WIDTH / videoEl.videoWidth;
    canvas.width = FRAME_WIDTH;
    canvas.height = videoEl.videoHeight * scale;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    framesRef.current.push({
      timestampMs: Date.now() - recordingStartRef.current,
      dataUrl: canvas.toDataURL('image/jpeg', 0.6),
    });
  }

  function stopRecording() {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    mediaRecorderRef.current?.stop();
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function uploadRecording() {
    setStatus('uploading');
    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video', blob, `feedback-recording-${Date.now()}.webm`);

      const trimmedNote = noteRef.current.trim();
      if (trimmedNote) formData.append('description', trimmedNote);

      if (framesRef.current.length > 0) {
        formData.append('frames', JSON.stringify(framesRef.current));
      }

      const res = await fetch('/api/process-recording', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process recording');

      setResult(`${data.issueKey}: ${data.summary} — ${data.issueUrl}`);
      setStatus('done');
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
      setStatus('error');
    }
  }

  const recording = status === 'recording';
  const uploading = status === 'uploading';

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <video ref={videoElRef} muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          noteRef.current = e.target.value;
        }}
        disabled={uploading}
        rows={3}
        placeholder="Optional: type a note, or just narrate out loud while recording — your voice is picked up automatically…"
        className="rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm resize-y disabled:opacity-50"
      />

      {!recording ? (
        <button
          onClick={startRecording}
          disabled={uploading}
          className="rounded-full bg-foreground px-5 py-3 text-background font-medium disabled:opacity-50"
        >
          Record Feedback
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="rounded-full bg-red-600 px-5 py-3 text-white font-medium"
        >
          Stop Recording
        </button>
      )}

      {uploading && <p className="text-sm">Uploading & analyzing recording...</p>}
      {result && <p className="text-sm">{result}</p>}
    </div>
  );
}
