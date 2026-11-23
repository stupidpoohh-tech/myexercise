import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * 하단 시트 (모달).
 * - 화면 하단에서 등장, 닫기 버튼 / 바깥 영역 터치 / Esc 로 닫힘
 * - 내용이 길면 시트 내부만 스크롤, 하단 안전 영역 반영
 * - 열릴 때 닫기 버튼으로 포커스 이동, Tab 순환을 시트 안으로 제한, 닫히면 원래 위치로 포커스 복귀
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && sheetRef.current) {
        const items = sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="bs-backdrop" onClick={onClose}>
      <div ref={sheetRef} className="bs" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="bs-handle" aria-hidden="true" />
        <div className="bs-head">
          <h2 id={titleId} className="bs-title">
            {title}
          </h2>
          <button ref={closeRef} className="icon-btn" aria-label="닫기" onClick={onClose}>
            <X size={22} strokeWidth={1.6} />
          </button>
        </div>
        <div className="bs-body">{children}</div>
      </div>
    </div>
  );
}
