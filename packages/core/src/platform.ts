import { createContext, useContext } from "react";

export type Platform = "web" | "desktop";

const PlatformContext = createContext<Platform>("web");

export function usePlatform(): Platform {
  return useContext(PlatformContext);
}

export const PlatformProvider = PlatformContext.Provider;
