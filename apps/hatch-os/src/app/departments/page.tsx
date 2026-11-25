import { notFound } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";
import { DepartmentsView } from "@/components/operator/DepartmentsView";

export const dynamic = "force-dynamic";

export default function DepartmentsPage() {
  if (!operatorUiEnabled()) notFound();
  return <DepartmentsView />;
}
