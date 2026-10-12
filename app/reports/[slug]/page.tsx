import { notFound } from "next/navigation";
import ReportView from "@/components/ReportView";
import { REPORTS, reportBySlug } from "@/lib/reports";

export function generateStaticParams() {
  return REPORTS.map((r) => ({ slug: r.slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = reportBySlug(slug);
  if (!report) notFound();
  return <ReportView report={report} />;
}
