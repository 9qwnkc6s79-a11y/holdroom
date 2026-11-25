import { notFound } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";
import { SourcesView } from "@/components/operator/SourcesView";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  if (!operatorUiEnabled()) notFound();
  return <SourcesView />;
}
