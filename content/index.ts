/**
 * Content manifest. This is the only place raw content files are imported.
 * Add new device files here (one JSON file per device keeps diffs and
 * reviews small). In a later phase this is replaced by Supabase queries
 * behind the same repository interface.
 */
import manufacturers from "./manufacturers/manufacturers.json";
import sources from "./sources/sources.json";
import ngAp8 from "./devices/northgate-demo-ap-8.json";
import ngKp2 from "./devices/northgate-demo-kp-2.json";
import ksPir12 from "./devices/kestrel-demo-ks-pir12.json";
import ksRs1 from "./devices/kestrel-demo-ks-rs1.json";
import ksSr20 from "./devices/kestrel-demo-ks-sr20.json";

export const rawContent = {
  manufacturers: manufacturers as unknown[],
  sources: sources as unknown[],
  devices: [ngAp8, ngKp2, ksPir12, ksRs1, ksSr20] as unknown[],
};
