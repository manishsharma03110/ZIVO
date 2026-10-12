'use client';

import { useEffect } from 'react';
import { STRINGS } from '@/lib/strings';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error('Chat route failed to render', error);
  }, [error]);

  return (
    <main className="error-boundary" role="alert">
      <h1>{STRINGS.ui.errorTitle}</h1>
      <p>{STRINGS.ui.errorBody}</p>
      <button type="button" onClick={reset}>{STRINGS.ui.retry}</button>
    </main>
  );
}
