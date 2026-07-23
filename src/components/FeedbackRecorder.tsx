'use client';

import { useRef, useState } from 'react';

export default function FeedbackRecorder() {
  const [recording, setRecording] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
    mediaRecorder.onstop = saveRecordingLocally;
    mediaRecorderRef.current = mediaRecorder;

    // stop automatically if the user ends sharing via the browser's own UI
    stream.getVideoTracks()[0].addEventListener('ended', stopRecording);

    mediaRecorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  function saveRecordingLocally() {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-recording-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3 max-w-md">
      {!recording ? (
        <button
          onClick={startRecording}
          className="rounded-full bg-foreground px-5 py-3 text-background font-medium"
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
    </div>
  );
}
