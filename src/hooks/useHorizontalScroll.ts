import { useRef, useCallback } from 'react';
import { Platform, ScrollView } from 'react-native';

/**
 * Reusable hook to enable mouse wheel horizontal scrolling on horizontal ScrollViews in React Native Web.
 *
 * Requirements:
 * - Only intercept wheel when the category container has horizontal overflow.
 * - Translate vertical wheel delta into container.scrollLeft.
 * - preventDefault only when the category container is actually scrolling horizontally.
 * - Do not break page vertical scroll when no horizontal overflow exists or when bounds are reached.
 * - Preserve native horizontal trackpad gestures (predominant deltaX).
 * - Safe on native iOS/Android (no-op).
 */
export function useHorizontalScroll<T = ScrollView>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback((node: T | null) => {
    // 1. Clean up any previous listener
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (Platform.OS !== 'web' || !node) return;

    // Resolve the underlying DOM element across React Native Web versions
    let el: HTMLElement | null = null;
    if (typeof (node as any).getScrollableNode === 'function') {
      el = (node as any).getScrollableNode();
    } else if (typeof (node as any).getNativeScrollRef === 'function') {
      el = (node as any).getNativeScrollRef();
    } else if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
      el = node;
    } else if ((node as any)._scrollNodeRef instanceof HTMLElement) {
      el = (node as any)._scrollNodeRef;
    }

    if (!el || typeof el.addEventListener !== 'function') return;

    const handleWheel = (e: WheelEvent) => {
      if (!el) return;

      // 1. Check if the element has horizontal overflow
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      if (maxScrollLeft <= 1) return;

      // 2. Preserve native horizontal trackpad gestures (predominant deltaX)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return;
      }

      // 3. Normalize vertical delta across deltaMode (pixel vs line vs page)
      let delta = e.deltaY;
      if (e.deltaMode === 1) {
        delta *= 20; // DOM_DELTA_LINE
      } else if (e.deltaMode === 2) {
        delta *= el.clientWidth; // DOM_DELTA_PAGE
      }

      if (delta === 0) return;

      // 4. Check if scrolling is possible in the requested direction
      const canScrollRight = delta > 0 && el.scrollLeft < maxScrollLeft - 1;
      const canScrollLeft = delta < 0 && el.scrollLeft > 1;

      // 5. Only prevent default and scroll when actually scrolling horizontally
      if (canScrollRight || canScrollLeft) {
        e.preventDefault();
        el.scrollLeft += delta;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    cleanupRef.current = () => {
      el?.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return setRef;
}
