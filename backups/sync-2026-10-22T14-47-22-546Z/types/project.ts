export interface MediaItem {
  src: string;
  type: "image" | "video";
  alt: string;
  poster?: string;
}

export interface Project {
  slug: string;
  title: string;
  category: string;
  year: number;
  role: string[];
  tools: string[];
  cover: {
    src: string;
    type: "image" | "video";
    poster?: string;
    alt: string;
    /**
     * Dedicated crop for the spiral showcase, at SPIRAL_CONFIG.aspect (4:3,
     * following the layout reference — e.g. 1600x1200). Falls back to `src`,
     * which the shader cover-crops instead.
     */
    spiral?: string;
  };
  gallery: MediaItem[];
  summary: string;
  description: string;
  featured: boolean;
  accent?: string;
  /** Case-study story authored in Studio (studio-framer). Absent = legacy layout. */
  blocks?: Block[];
}

/** Media as Studio writes it — MediaItem plus intrinsic size when known. */
export interface BlockMedia extends MediaItem {
  width?: number;
  height?: number;
}

export type MediaLayout = "full" | "wide" | "inset";

export type Block =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "text"; html: string }
  | { id: string; type: "image"; media: BlockMedia | null; layout: MediaLayout; caption?: string }
  | { id: string; type: "pair"; items: (BlockMedia | null)[]; split: "50" | "60" | "40"; caption?: string }
  | { id: string; type: "gallery"; items: BlockMedia[]; columns: number; caption?: string }
  | {
      id: string;
      type: "video";
      source: "file" | "embed";
      media: BlockMedia | null;
      url?: string;
      autoplay?: boolean;
      layout: MediaLayout;
      caption?: string;
    }
  | {
      id: string;
      type: "compare";
      before: BlockMedia | null;
      after: BlockMedia | null;
      beforeLabel?: string;
      afterLabel?: string;
      caption?: string;
    }
  | { id: string; type: "quote"; text: string; cite?: string }
  | { id: string; type: "facts"; rows: { label: string; value: string }[] }
  | { id: string; type: "divider"; line?: boolean };

export interface Capability {
  title: string;
  description: string;
  index: string;
}
