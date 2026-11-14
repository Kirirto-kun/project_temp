'use client';

import { Toaster as Sonner } from 'sonner';

/** One toaster for the app. Call `toast()` from 'sonner' anywhere. Colors follow Holdline tokens in both themes. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      gap={10}
      offset={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      mobileOffset={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      toastOptions={{
        style: {
          background: 'var(--raised)',
          color: 'var(--ink)',
          border: '0',
          boxShadow: 'var(--shadow-lift)',
          borderRadius: '16px',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
        },
      }}
    />
  );
}
