"use client";

import { useEffect } from "react";
import { useRecentDevices } from "@/lib/storage/use-device-lists";

/** Records a device page view in the on-device "recently viewed" list. */
export function RecordView({ deviceId }: { deviceId: string }) {
  const { record } = useRecentDevices();
  useEffect(() => record(deviceId), [deviceId, record]);
  return null;
}
