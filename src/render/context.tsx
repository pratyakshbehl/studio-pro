import { createContext, useContext, type ReactNode } from "react";
import type { Block, Project } from "../model/schema.ts";

/**
 * Everything the renderer needs from its host. The editor and the site each
 * supply their own; render/ itself imports nothing from Vite, Next or the editor.
 */
export interface RenderHost {
  /** Turn a stored path ("/images/…", "/media/…") into a loadable URL. */
  mediaUrl: (src: string) => string;
  /** Editing: show placeholders for empty blocks, ghost hidden ones, freeze interactive blocks. */
  editing: boolean;
  project: Project;
  /** Title of the project after this one, for the page footer. */
  nextTitle?: string;
  nextHref?: string;
  /** Editor only: the selected gallery image ("blockId#index"), so a slideshow can show it. */
  activeItem?: string | null;
  /** Editor only: the block whose words are being edited in place, and how to draw that editor. */
  editText?: { id: string; part: "text" | "cite"; render: (block: Block) => ReactNode };
}

const Ctx = createContext<RenderHost | null>(null);

export const RenderProvider = Ctx.Provider;

export function useHost(): RenderHost {
  const host = useContext(Ctx);
  if (!host) throw new Error("Renderer used outside <RenderProvider>");
  return host;
}
