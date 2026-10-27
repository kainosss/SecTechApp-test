import type { JobType } from "./schema";

/** Quick-add equipment types per job type. Technicians can always type their own. */
export const EQUIPMENT_PRESETS: Record<JobType, string[]> = {
  cctv: ["Camera", "NVR", "Recording server", "Network switch", "Monitor", "Decoder", "Intercom"],
  intruder: ["Alarm panel", "PIR", "Reed switch", "Keypad", "Siren/strobe", "Expander", "Duress device", "Communicator"],
  access: ["Controller", "Card reader", "Electric strike", "Maglock", "REX device", "Door contact", "Power supply"],
  general: ["Alarm panel", "Camera", "Controller", "Card reader", "Power supply", "Network switch", "Intercom"],
};
