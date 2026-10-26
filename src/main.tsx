import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/styles.css";
import "./cms/cms.css";
import "./cms/cms-manage.css";
import "./media/media.css";
import "./publish/publish.css";
import "./render/render.css";
import "./editor/editor.css";
import "./editor/tools.css";
import "./editor/panels.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
