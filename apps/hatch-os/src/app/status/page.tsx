import { notFound } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";
import { StatusView } from "@/components/operator/StatusView";

export const dynamic = "force-dynamic";

export default function StatusPage() {
  if (!operatorUiEnabled()) notFound();
  return <StatusView />;
}
