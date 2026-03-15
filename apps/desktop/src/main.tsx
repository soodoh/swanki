import { createRoot } from "react-dom/client";

function App() {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      Hello Swanki Desktop
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
