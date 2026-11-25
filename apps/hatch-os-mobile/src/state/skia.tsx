import { createContext, useContext, type ReactNode } from "react";

// CanvasKit is loaded in index.js before the app imports Skia, so the
// shader factory is bound to a real CanvasKit. Native Skia does not need that.
const SkiaContext = createContext(true);

export function SkiaProvider({ children }: { children: ReactNode }) {
  return <SkiaContext.Provider value={true}>{children}</SkiaContext.Provider>;
}

export function useSkiaReady(): boolean {
  return useContext(SkiaContext);
}
