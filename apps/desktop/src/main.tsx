import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { DesktopProvider } from "./providers/desktop-provider";
import { router } from "./routes";

// Import desktop CSS entry point (adds @source for web app, then globals.css)
import "./styles.css";

function App(): React.ReactElement {
  return (
    <StrictMode>
      <DesktopProvider>
        <RouterProvider router={router} />
      </DesktopProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
