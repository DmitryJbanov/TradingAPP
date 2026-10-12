import { NotesPage } from "../src/components/notes-page";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Terminal from "../src/components/terminal";
import { FearGreedPage } from "../src/components/fear-greed-page";
import { RsiHeatmapPage } from "../src/components/rsi-heatmap-page";
import { WhalesPage } from "../src/components/whales-page";
import { StandaloneProfilesProvider } from "../src/components/profile-provider";
import "../app/globals.css";
function Pages() {
  const [url, setUrl] = useState(() => new URL(location.href));
  useEffect(() => {
    const update = () => setUrl(new URL(location.href));
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? (event.target.closest("a[href]") as HTMLAnchorElement | null)
          : null;
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const next = new URL(link.href, location.href);
      if (
        next.origin !== location.origin ||
        !/^\/(?:pair\/[^/]+\/?|whales(?:\/[^/]+)?\/?|fear-greed\/?|rsi-heatmap\/?|notes\/?|backlog\/?)?$/.test(
          next.pathname,
        )
      )
        return;
      if (
        next.pathname === location.pathname &&
        next.search === location.search
      )
        return;
      event.preventDefault();
      history.pushState(null, "", next.href);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", update);
    document.addEventListener("click", navigate);
    return () => {
      window.removeEventListener("popstate", update);
      document.removeEventListener("click", navigate);
    };
  }, []);
  const match = url.pathname.match(/^\/pair\/([^/]+)\/?$/);
  const whale = url.pathname.match(/^\/whales\/([^/]+)\/?$/);
  return url.pathname.startsWith("/whales") ? (
    <WhalesPage
      watchlistOnly={whale?.[1] === "watchlist"}
      address={
        whale && whale[1] !== "watchlist"
          ? decodeURIComponent(whale[1]).toLowerCase()
          : undefined
      }
    />
  ) : ["/notes", "/backlog"].includes(url.pathname.replace(/\/$/, "")) ? (
    <NotesPage />
  ) : url.pathname.replace(/\/$/, "") === "/fear-greed" ? (
    <FearGreedPage />
  ) : url.pathname.replace(/\/$/, "") === "/rsi-heatmap" ? (
    <RsiHeatmapPage />
  ) : (
    <Terminal symbol={match ? decodeURIComponent(match[1]) : undefined} />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StandaloneProfilesProvider>
      <Pages />
    </StandaloneProfilesProvider>
  </React.StrictMode>,
);
