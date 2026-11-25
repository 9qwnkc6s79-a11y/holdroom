import { notFound } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";
import { FilesView } from "@/components/operator/FilesView";

export const dynamic = "force-dynamic";

export default function FilesPage() {
  if (!operatorUiEnabled()) notFound();
  return <FilesView />;
}
