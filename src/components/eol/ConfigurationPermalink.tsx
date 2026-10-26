"use client";

import type { WiringDetail } from "@/lib/content/repository";
import { useUrlSelection } from "@/lib/eol/use-url-selection";
import { ConfigurationView } from "./ConfigurationView";

/** The configuration view on its permanent page; the selected state is kept in ?state=. */
export function ConfigurationPermalink({ detail }: { detail: WiringDetail }) {
  const { selection, update } = useUrlSelection();
  return <ConfigurationView detail={detail} stateId={selection.state} onStateChange={(state) => update({ state }, "replace")} />;
}
