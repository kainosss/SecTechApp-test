import type { Metadata } from "next";
import { buildSearchIndex } from "@/lib/search/build-index";
import { UniversalSearch } from "@/components/dashboard/UniversalSearch";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return (
    <>
      <PageHeader eyebrow="Search" title="Search everything" description="Devices, model numbers, manufacturers and tools." />
      <UniversalSearch key={q} index={await buildSearchIndex()} initialQuery={q} autoFocus={!q} previewLimit={50} />
    </>
  );
}
