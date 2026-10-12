'use client';

import { useEffect, useRef } from 'react';
import { STRINGS } from '@/lib/strings';

export default function PermissionDialog({ request, permissionInfo, permissionBusy, returnFocusTo, onAllow, onCancel, onClose, onRequestAgain }) {
  const dialogRef = useRef(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const trigger = returnFocusTo || document.activeElement;
    const getFocusables = () => Array.from(node.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
    getFocusables()[1]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusables();
      if (!focusables.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  const isVideoCall = request?.video && (request?.kind === 'call' || request?.kind === 'accept');
  const description = request?.kind === 'notifications'
    ? STRINGS.permission.notificationsBody
    : isVideoCall
      ? STRINGS.permission.combinedBody
      : request?.video || request?.kind === 'photo'
        ? STRINGS.permission.cameraBody
        : STRINGS.permission.micBody;

  const title = request?.kind === 'notifications'
    ? STRINGS.permission.notificationsTitle
    : isVideoCall
      ? STRINGS.permission.combinedTitle
      : request?.video || request?.kind === 'photo'
        ? STRINGS.permission.cameraTitle
        : STRINGS.permission.micTitle;

  const isBlocked = permissionInfo?.permission === 'denied' || permissionInfo?.permission === 'blocked';
  const grantedText = isVideoCall
    ? STRINGS.permission.combinedEnabled
    : request?.video || request?.kind === 'photo'
      ? STRINGS.permission.cameraEnabled
      : request?.kind === 'notifications'
        ? STRINGS.permission.notificationsEnabled
        : STRINGS.permission.microphoneEnabled;
  const primaryText = permissionInfo?.ready ? STRINGS.permission.startNow : permissionBusy ? STRINGS.permission.checking : STRINGS.permission.allow;

  return (
    <div className="permission-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        aria-describedby="permission-description"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="permission-close" aria-label={STRINGS.permission.closeDialog} onClick={onClose} disabled={permissionBusy}>×</button>
        <div className="permission-icon" aria-hidden="true">◉</div>
        <h2 id="permission-title">{permissionInfo?.ready ? grantedText : title}</h2>
        <p id="permission-description">{permissionInfo?.message || description}</p>
        {permissionInfo?.instructions && <p className="permission-steps">{permissionInfo.instructions}</p>}
        {permissionInfo?.permission === 'checking' && <p className="permission-status">{STRINGS.permission.checking}</p>}
        {permissionInfo?.permission === 'unsupported' && <p className="permission-status">{STRINGS.permission.unsupported}</p>}
        {isBlocked && <p className="permission-status">{STRINGS.permission.blocked}</p>}

        <div className="permission-actions">
          <button type="button" className="permission-allow" onClick={onAllow} disabled={permissionBusy}>
            {permissionBusy && <span className="btn-spin" aria-hidden="true" />}
            {primaryText}
          </button>
          <button type="button" className="permission-deny" onClick={onCancel} disabled={permissionBusy}>
            {STRINGS.permission.dontAllow}
          </button>
        </div>

        <div className="permission-actions secondary-actions">
          <button type="button" className="permission-cancel" onClick={onClose} disabled={permissionBusy}>{STRINGS.permission.cancel}</button>
          {isBlocked && (
            <button type="button" className="permission-retry" onClick={onRequestAgain || onAllow} disabled={permissionBusy}>
              {STRINGS.permission.tryAgain}
            </button>
          )}
        </div>

        <div className="privacy-note">{STRINGS.permission.privacyNote}</div>
      </section>
    </div>
  );
}
