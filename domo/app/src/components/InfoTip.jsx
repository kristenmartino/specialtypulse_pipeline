import React from "react";

/**
 * InfoTip — a small "i" glyph that reveals a definition on hover/focus.
 * CSS-only tooltip (see .info-tip in styles.css); accessible via aria-label + tabIndex.
 */
export default function InfoTip({ text }) {
  if (!text) return null;
  return (
    <span
      className="info-tip"
      tabIndex={0}
      role="note"
      aria-label={text}
      data-tip={text}
    >
      i
    </span>
  );
}
