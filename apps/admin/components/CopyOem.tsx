'use client';

import { useState } from 'react';

// A part number that copies itself on click ("Copied" for a moment). The
// clipboard needs a secure context; the console runs on 127.0.0.1, which counts.
export function CopyOem({ oem, className = '' }: { oem: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(oem);
    } catch {
      // Fallback for a browser that refuses the clipboard API.
      const t = document.createElement('textarea');
      t.value = oem;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" className={`copy-oem mono ${className}`} onClick={copy} title="Click to copy">
      {oem}
      <span className="copy-tag">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
