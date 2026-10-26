import type { Metadata } from "next";
import { getDeviceListItems, getManufacturer, getManufacturers } from "@/lib/content/repository";
import { deviceCategorySchema } from "@/lib/content/schema";
import { DeviceBrowser } from "@/components/devices/DeviceBrowser";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Device Library" };

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; manufacturer?: string }>;
}) {
  const params = await searchParams;
  const category = deviceCategorySchema.safeParse(params.category);
  const manufacturer = params.manufacturer ? getManufacturer(params.manufacturer) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Device Library"
        title="Device Library"
        description="Terminals, electrical specifications, installation notes and the manufacturer documents behind them."
      />
      <div className="mb-5">
        <DemoNotice compact />
      </div>
      <DeviceBrowser
        devices={getDeviceListItems()}
        manufacturers={getManufacturers().map(({ id, name }) => ({ id, name }))}
        initialFilter={{
          query: params.q ?? "",
          category: category.success ? category.data : undefined,
          manufacturerId: manufacturer?.id,
        }}
      />
    </>
  );
}
