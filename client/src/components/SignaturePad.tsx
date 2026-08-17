import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

// Generic canvas signature pad — Pointer Events cover mouse, trackpad, and touch
// uniformly, so no separate touch handlers are needed. `touch-none` on the canvas
// stops the page from scrolling while the admin is mid-stroke on a touchscreen.
// Backing-store resolution is capped at 2x devicePixelRatio (not the raw screen
// DPR, which can be 3-4x on newer displays) — keeps the exported PNG's pixel
// dimensions, and therefore its file size, bounded regardless of the admin's
// monitor. A signature (mostly transparent background, thin dark strokes) at that
// size is a few KB, nowhere near the 2MB upload cap — no separate resize step
// needed.
export function SignaturePad({ onSave, height = 160 }: { onSave: (file: File) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = container.clientWidth;
    canvas.width = cssWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1a1a1a';
    }
  }, [height]);

  function point(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point(e);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e);
    const last = lastPointRef.current!;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    setHasDrawn(true);
  }

  function stopDrawing() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function handleClear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  // A blank canvas can't be saved — hasDrawn (any stroke at all) gates both
  // buttons.
  function handleSave() {
    canvasRef.current!.toBlob((blob) => {
      if (!blob) return;
      onSave(new File([blob], 'signature.png', { type: 'image/png' }));
    }, 'image/png');
  }

  return (
    <div>
      <div ref={containerRef} className="rounded-lg border border-dashed border-muted">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          className="touch-none cursor-crosshair"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasDrawn}
          className="text-xs font-semibold text-muted disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasDrawn}
          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-50"
        >
          Save signature
        </button>
      </div>
    </div>
  );
}
