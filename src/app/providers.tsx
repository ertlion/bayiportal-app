"use client";

import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge/utilities";
import type { ClientApplication } from "@shopify/app-bridge";

interface AppBridgeContextValue {
  app: ClientApplication | null;
  authenticatedFetch: typeof fetch;
}

const AppBridgeContext = createContext<AppBridgeContextValue>({
  app: null,
  authenticatedFetch: fetch,
});

export function useAppBridge() {
  return useContext(AppBridgeContext);
}

export function useAuthenticatedFetch() {
  const { authenticatedFetch } = useContext(AppBridgeContext);
  return authenticatedFetch;
}

function getHostParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("host");
}

export function Providers({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<ClientApplication | null>(null);

  useEffect(() => {
    const host = getHostParam();
    const apiKey = document
      .querySelector('meta[name="shopify-api-key"]')
      ?.getAttribute("content");

    if (!apiKey || !host) return;

    try {
      const appInstance = createApp({
        apiKey,
        host,
      });
      setApp(appInstance);
    } catch (error) {
      console.error("Failed to initialize App Bridge:", error);
    }
  }, []);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);

      if (app) {
        try {
          const token = await getSessionToken(app);
          headers.set("Authorization", `Bearer ${token}`);
        } catch (error) {
          console.error("Failed to get session token:", error);
        }
      }

      return fetch(input, { ...init, headers });
    },
    [app],
  );

  const contextValue = useMemo(
    () => ({ app, authenticatedFetch }),
    [app, authenticatedFetch],
  );

  return (
    <AppProvider i18n={translations}>
      <AppBridgeContext.Provider value={contextValue}>
        {children}
      </AppBridgeContext.Provider>
    </AppProvider>
  );
}
