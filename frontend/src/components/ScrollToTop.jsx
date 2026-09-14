import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Reset scroll to the top when the route changes.
 *
 * A single-page app does not reload the document, so the window keeps whatever
 * scroll offset the previous page had. React Router only resets it for you
 * through <ScrollRestoration>, which requires a data router — this app uses
 * <BrowserRouter> with <Routes>, so nothing resets it at all.
 *
 * It usually looks fine by accident: pages fetch their data on mount, so they
 * render short and the browser clamps the offset to 0 before the content grows.
 * The student dashboard is ~9200px with the French catalogue, so when the
 * accident does not happen — content already warm, a fast response painting
 * before the browser settles — the interview page opens scrolled past its own
 * content and reads as blank until you scroll up. Hence "sometimes".
 *
 * scrollRestoration is set to 'manual' in main.jsx so the browser does not
 * re-apply a stored offset after this effect has run.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // 'instant' rather than smooth: this is a page change, not a movement
    // within a page, and animating it makes the new page look like it jumped.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
