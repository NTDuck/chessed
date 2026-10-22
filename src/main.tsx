import { createRoot } from "react-dom/client";
import App from "./App";

const el = document.getElementById("laya-host");
if (!el) throw new Error("missing #laya-host");
createRoot(el).render(<App />);
