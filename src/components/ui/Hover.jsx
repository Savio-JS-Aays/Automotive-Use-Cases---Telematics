import React, { useState } from "react";
import { createPortal } from "react-dom";

/**
 * Wraps an element and shows `content` in a dark tooltip that follows the pointer.
 * Rendered in a portal with fixed positioning, so scrolling or overflow-hidden containers
 * never clip it. `as` picks the wrapper element (div by default, "button" for clickable cells).
 */
export default function Hover({ content, as: Tag = "div", children, ...rest }) {
  const [pos, setPos] = useState(null);
  const enabled = content !== null && content !== undefined && content !== "";
  const flip = pos && typeof window !== "undefined" && pos.x > window.innerWidth - 300;
  return (
    <Tag
      {...rest}
      onMouseMove={enabled ? (e) => setPos({ x: e.clientX, y: e.clientY }) : undefined}
      onMouseLeave={enabled ? () => setPos(null) : undefined}
    >
      {children}
      {enabled &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 max-w-xs rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
            style={{ left: pos.x + 14, top: pos.y + 14, transform: flip ? "translateX(calc(-100% - 28px))" : undefined }}
          >
            {content}
          </div>,
          document.body
        )}
    </Tag>
  );
}
