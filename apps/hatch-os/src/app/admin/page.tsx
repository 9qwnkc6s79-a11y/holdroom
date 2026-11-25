import { notFound } from "next/navigation";
import { operatorUiEnabled } from "@/lib/operator";
import { AdminView } from "@/components/operator/AdminView";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (!operatorUiEnabled()) notFound();
  return <AdminView />;
}
