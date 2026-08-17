import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignaturePad } from './SignaturePad';

// jsdom doesn't implement canvas rendering at all — HTMLCanvasElement.getContext
// normally returns null (with a console warning), and toBlob doesn't exist. Both
// are stubbed here so the component's drawing/export logic can run in a test
// environment; a real browser's canvas is what's actually exercised in the app.
function stubCanvas() {
  const ctx = {
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    lineCap: '',
    strokeStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(['fake-png-bytes'], { type: 'image/png' }));
  });
  // jsdom doesn't implement pointer-capture at all — the method isn't even
  // defined on the prototype, so it must be assigned directly rather than spied on.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 200,
    bottom: 160,
    width: 200,
    height: 160,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
}

function draw(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40 });
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40 });
}

describe('SignaturePad', () => {
  beforeEach(() => {
    stubCanvas();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with Clear and Save disabled', () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save signature/i })).toBeDisabled();
  });

  it('enables Clear and Save after a stroke is drawn', () => {
    const { container } = render(<SignaturePad onSave={vi.fn()} />);
    draw(container.querySelector('canvas')!);

    expect(screen.getByRole('button', { name: /clear/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /save signature/i })).toBeEnabled();
  });

  it('calls onSave with a File named signature.png of type image/png', () => {
    const onSave = vi.fn();
    const { container } = render(<SignaturePad onSave={onSave} />);
    draw(container.querySelector('canvas')!);

    fireEvent.click(screen.getByRole('button', { name: /save signature/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const file = onSave.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('signature.png');
    expect(file.type).toBe('image/png');
  });

  it('Clear resets back to disabled', () => {
    const { container } = render(<SignaturePad onSave={vi.fn()} />);
    const canvas = container.querySelector('canvas')!;
    draw(canvas);
    expect(screen.getByRole('button', { name: /clear/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save signature/i })).toBeDisabled();
  });
});
