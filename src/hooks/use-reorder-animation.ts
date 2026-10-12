import { useLayoutEffect, useRef } from "react";

export function useReorderAnimation<T extends HTMLElement>(order: string) {
  const ref = useRef<T>(null);
  const previous = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const nodes = ref.current?.querySelectorAll<HTMLElement>("[data-sort-id]");
    if (!nodes) return;
    const next = new Map<string, DOMRect>();
    nodes.forEach((node) => {
      const id = node.dataset.sortId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      const before = previous.current.get(id);
      if (before && (before.left !== rect.left || before.top !== rect.top)) {
        node.animate(
          [
            {
              transform: `translate(${before.left - rect.left}px, ${before.top - rect.top}px)`,
            },
            { transform: "translate(0, 0)" },
          ],
          { duration: 210, easing: "cubic-bezier(.2,.75,.25,1)" },
        );
      }
      next.set(id, rect);
    });
    previous.current = next;
  }, [order]);

  return ref;
}
