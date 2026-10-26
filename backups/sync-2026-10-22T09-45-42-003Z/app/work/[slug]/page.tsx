import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { projects, getProjectBySlug } from "@/data/projects";
import { Footer } from "@/components/layout/Footer";
import { RevealText } from "@/components/ui/RevealText";
import { MagneticButton } from "@/components/ui/MagneticButton";
import { NextProjectScroll } from "@/components/work/NextProjectScroll";
import { CaseStudyBlocks } from "@/components/work/CaseStudyBlocks";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) return {};
  return {
    title: project.title,
    description: project.summary,
    openGraph: { title: project.title, description: project.summary },
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectBySlug(slug);
  if (!project) notFound();

  // A Studio story replaces the legacy gallery grid; the intro stays above it.
  const hasStory = !!project.blocks?.length;
  const currentIndex = projects.findIndex((p) => p.slug === slug);
  const next = projects[(currentIndex + 1) % projects.length];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: project.summary,
    creator: { "@type": "Person", name: "Pratyaksh Behl" },
    dateCreated: String(project.year),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="px-6 md:px-10 pt-32 md:pt-44 pb-10">
        <span className="text-xs uppercase tracking-widest text-muted">
          {project.category} · {project.year}
        </span>
        <RevealText
          as="h1"
          trigger="load"
          className="mt-3 text-[11vw] md:text-7xl font-display leading-[0.95] max-w-4xl"
        >
          {project.title}
        </RevealText>
      </section>

      <div
        className="mx-6 md:mx-10 aspect-[16/9] rounded-2xl overflow-hidden relative"
        style={
          project.cover.src
            ? undefined
            : {
                background: `radial-gradient(circle at 30% 20%, hsl(${project.accent ?? "265 85% 58%"} / 0.5), hsl(var(--surface)) 65%)`,
              }
        }
        role="img"
        aria-label={project.cover.alt}
      >
        {project.cover.src && (
          <Image
            src={project.cover.src}
            alt={project.cover.alt}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        )}
      </div>

      {!hasStory && project.gallery.length > 1 && (
        <section className="px-6 md:px-10 py-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {project.gallery.slice(1).map((item) => (
            <div key={item.src} className="aspect-[4/3] rounded-2xl overflow-hidden relative">
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </section>
      )}

      <section className="px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-8">
          <p className="text-lg md:text-2xl leading-relaxed text-text">{project.description}</p>
        </div>
        <div className="md:col-span-4 grid gap-8">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted mb-2">Role</h2>
            <p>{project.role.join(", ")}</p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted mb-2">Tools</h2>
            <p>{project.tools.join(", ")}</p>
          </div>
        </div>
      </section>

      {hasStory && <CaseStudyBlocks blocks={project.blocks!} />}

      <section className="px-6 md:px-10 py-16 border-t border-border flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-2">Next project</p>
          <Link href={`/work/${next.slug}`} data-cursor-hover className="text-2xl md:text-4xl font-display hover:text-accent transition-colors">
            {next.title} →
          </Link>
        </div>
        <MagneticButton href="/work" variant="outline">
          All work
        </MagneticButton>
      </section>

      <Footer />

      <NextProjectScroll
        key={project.slug}
        nextSlug={next.slug}
        nextTitle={next.title}
        accent={next.accent}
      />
    </>
  );
}
