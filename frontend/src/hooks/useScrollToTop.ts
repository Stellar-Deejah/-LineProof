import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls the window to the top on every forward navigation (pathname change).
 *
 * Back/forward browser navigation is intentionally excluded: the `navigationType`
 * check lets the browser's native scroll-restoration handle those cases so users
 * land back where they were, which is the expected behaviour and aligns with the
 * WHATWG "scroll restoration" spec.
 *
 * Usage: call inside a component that is rendered inside <BrowserRouter>, e.g.
 *   function ScrollToTop() { useScrollToTop(); return null; }
 */
export function useScrollToTop(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    // scrollTo with options lets us skip the smooth-scroll animation so the
    // reset is instant and doesn't fight with the incoming page's own scroll.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
}
