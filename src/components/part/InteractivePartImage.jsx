import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, Move, ScanSearch } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 2.8;
const STEP = 0.2;

export default function InteractivePartImage({ src, alt, partNumber, specs = [], onOpen }) {
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const stop = () => setDragging(false);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const changeScale = (delta) => {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((current + delta).toFixed(1))));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (event) => {
    if (scale <= 1) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };

  const onPointerMove = (event) => {
    if (!dragging || scale <= 1) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
  };

  const onWheel = (event) => {
    if (!stageRef.current) return;
    event.preventDefault();
    changeScale(event.deltaY < 0 ? STEP : -STEP);
  };

  const keySpecs = specs.slice(0, 4);

  if (!src) {
    return (
      <div className="ip-part-visual ip-part-visual-empty">
        <div className="text-center px-6">
          <ScanSearch className="mx-auto h-8 w-8 text-white/25" />
          <div className="mt-2 text-sm text-white/55">Imagen de la pieza no disponible</div>
          <div className="mt-1 text-[10px] text-white/30">La ficha técnica sigue disponible con los datos verificados.</div>
        </div>
      </div>
    );
  }

  return (
    <section className="ip-part-explorer" aria-label="Explorador de pieza">
      <div
        ref={stageRef}
        className={`ip-part-visual ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
      >
        <div className="ip-part-visual-grid" aria-hidden="true" />
        <div className="ip-part-visual-corner ip-part-visual-corner-tl" aria-hidden="true" />
        <div className="ip-part-visual-corner ip-part-visual-corner-br" aria-hidden="true" />
        <div className="ip-part-visual-badge"><Move className="h-3 w-3" /> {scale > 1 ? 'Arrastra para explorar' : 'Explora la pieza'}</div>
        <img
          src={src}
          alt={alt || partNumber || 'Pieza industrial'}
          className="ip-part-image"
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
          draggable="false"
        />
        <div className="ip-part-image-caption">
          <span>{partNumber || 'Referencia'}</span>
          <span className="ip-part-image-status">Vista 2D</span>
        </div>
      </div>

      <div className="ip-part-explorer-bar">
        <div className="flex items-center gap-1.5 min-w-0">
          <ScanSearch className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="ip-part-explorer-label">Explorar</span>
          <span className="text-white/25 text-[10px] hidden sm:inline">·</span>
          <span className="text-white/35 text-[10px] truncate hidden sm:inline">Zoom y desplazamiento</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => changeScale(-STEP)} disabled={scale <= MIN_SCALE} className="ip-part-tool" aria-label="Alejar" title="Alejar"><Minus className="h-3.5 w-3.5" /></button>
          <span className="ip-part-zoom" aria-live="polite">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => changeScale(STEP)} disabled={scale >= MAX_SCALE} className="ip-part-tool" aria-label="Acercar" title="Acercar"><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={reset} className="ip-part-tool" aria-label="Restablecer vista" title="Restablecer"><RotateCcw className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onOpen} className="ip-part-tool ip-part-tool-primary" aria-label="Ampliar imagen" title="Ampliar"><Maximize2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {keySpecs.length > 0 && (
        <div className="ip-part-key-specs" aria-label="Datos técnicos destacados">
          {keySpecs.map((spec) => (
            <div key={spec.id} className="ip-part-key-spec">
              <span className="text-white/35 text-[9px] uppercase tracking-wide truncate">{spec.attribute_name}</span>
              <strong className="text-white/80 text-[11px] font-medium truncate">{spec.original_value ?? '—'}{spec.original_unit ? ` ${spec.original_unit}` : ''}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
