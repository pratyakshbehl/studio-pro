import { useEffect } from "react";
import { match, usePath, linkProps } from "./lib/router.ts";
import { Home } from "./cms/Home.tsx";
import { MediaLibrary } from "./media/MediaLibrary.tsx";
import { TopBar } from "./cms/TopBar.tsx";
import { Editor } from "./editor/Editor.tsx";
import { Preview } from "./preview/Preview.tsx";

export function App() {
  const route = match(usePath());

  useEffect(() => {
    if (route.name === "home") document.title = "Projects · Studio Pro";
    if (route.name === "media") document.title = "Media · Studio Pro";
  }, [route.name]);

  switch (route.name) {
    case "home":
      return <Home />;
    case "media":
      return <MediaLibrary />;
    case "project":
      return <Editor key={route.id} id={route.id} />;
    case "preview":
      return <Preview key={route.id} id={route.id} />;
    case "missing":
      return (
        <>
          <TopBar />
          <main className="center-note">
            <h1>Nothing at {route.path}</h1>
            <p>
              That address isn't part of Studio Pro. <a {...linkProps("/")}>Back to projects</a>
            </p>
          </main>
        </>
      );
  }
}
