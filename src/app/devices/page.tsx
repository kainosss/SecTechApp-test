import type { Metadata } from "next";
import { Suspense } from "react";
import { listDevices, listManufacturers } from "@/lib/content/repository";
import { DeviceBrowser, DeviceBrowserFromUrl } from "@/components/devices/DeviceBrowser";
import { DemoNotice } from "@/components/ui/DemoNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Device Library" };

export default async function DevicesPage() {
  const [devices, manufacturers] = await Promise.all([listDevices(), listManufacturers()]);
  return (
    <>
      <PageHeader
        eyebrow="Device Library"
        title="Device Library"
        description="Find a device by model, part number or manufacturer, then check its terminals, power and manufacturer documents."
      />
      <div className="mb-5">
        <DemoNotice compact />
      </div>
      {/* Static shell renders the full list; the URL-aware browser takes over on the client. */}
      <Suspense fallback={<DeviceBrowser devices={devices} manufacturers={manufacturers} initialFilter={{}} />}>
        <DeviceBrowserFromUrl devices={devices} manufacturers={manufacturers} />
      </Suspense>
    </>
  );
}
