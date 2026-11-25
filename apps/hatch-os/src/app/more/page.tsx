import { notFound } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";
import { MoreView } from "@/components/operator/MoreView";

export const dynamic = "force-dynamic";

export default function MorePage() {
  if (!operatorUiEnabled()) notFound();
  return <MoreView />;
}
