import { useEffect, useState } from "react";
import { beginPageFadeOut } from "./page-transition";

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function currentHash(): string {
  return window.location.hash || "#/";
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart = ""] = raw.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  return { path, segments, query: new URLSearchParams(queryPart) };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(currentHash);
  useEffect(() => {
    const onChange = () => {
      beginPageFadeOut();
      setHash(currentHash());
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return parseRoute(hash);
}

export function navigate(to: string): void {
  const target = to.startsWith("#") ? to : `#${to}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function routeHref(to: string): string {
  return to.startsWith("#") ? to : `#${to}`;
}
