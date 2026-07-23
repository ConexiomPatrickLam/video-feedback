'use client';

import { useRef, useState } from 'react';

type Status = 'idle' | 'recording' | 'uploading' | 'done' | 'error';

export default function FeedbackRecorder() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Mirror the note in a ref: uploadRecording is bound to mediaRecorder.onstop at
  // record-start, so reading `note` from state there would be stale.
  const noteRef = useRef('');

  async function startRecording() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch {
      // user canceled the browser's share picker, or permission was denied
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = uploadRecording;
    mediaRecorderRef.current = mediaRecorder;

    // stop automatically if the user ends sharing via the browser's own UI
    stream.getVideoTracks()[0].addEventListener('ended', stopRecording);

    mediaRecorder.start();
    setResult(null);
    setStatus('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function uploadRecording() {
    setStatus('uploading');
    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video', blob, `feedback-recording-${Date.now()}.webm`);

      const trimmedNote = noteRef.current.trim();
      if (trimmedNote) formData.append('description', trimmedNote);

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
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          noteRef.current = e.target.value;
        }}
        disabled={uploading}
        rows={3}
        placeholder="Optional: describe what went wrong or what you'd like changed…"
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
