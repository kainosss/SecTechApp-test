import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Pilot"
        title="Send feedback"
        description="Report a bug, something confusing, incorrect technical information, or an idea. Every field is optional."
      />
      <FeedbackForm />
    </div>
  );
}
