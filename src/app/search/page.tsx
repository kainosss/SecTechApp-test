import type { Metadata } from "next";
import { Suspense } from "react";
import { buildSearchIndex } from "@/lib/search/build-index";
import { UniversalSearch, UniversalSearchFromUrl } from "@/components/dashboard/UniversalSearch";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  const index = await buildSearchIndex();
  return (
    <>
      <PageHeader
        eyebrow="Search"
        title="Search everything"
        description="Devices, model numbers, manufacturers, wiring configurations and troubleshooting workflows."
      />
      <Suspense fallback={<UniversalSearch index={index} previewLimit={50} />}>
        <UniversalSearchFromUrl index={index} autoFocus previewLimit={50} />
      </Suspense>
    </>
  );
}
