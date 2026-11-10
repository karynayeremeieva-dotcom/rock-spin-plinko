import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/context';
import { showBackButton } from '../platform/telegram';
import { IconClose } from './icons';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet on phones, centred dialog on desktop.
 * Closes on Esc, backdrop tap and Telegram's native Back button.
 */
export function Sheet({ title, onClose, children }: SheetProps) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      // Space inside a sheet must not drop balls behind it.
      if (e.code === 'Space') e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    const hideBack = showBackButton(() => closeRef.current());
    return () => {
      window.removeEventListener('keydown', onKey, true);
      hideBack();
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="sheet__head">
          <h2 className="sheet__title">{title}</h2>
          <button type="button" className="icon-btn" aria-label={t.close} onClick={onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
