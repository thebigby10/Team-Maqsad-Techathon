import { DashboardClient } from "@/components/DashboardClient";

/**
 * Server Component shell. The dashboard itself runs entirely on the
 * client so it can open an EventSource.
 */
export default function Page() {
  return <DashboardClient />;
}
