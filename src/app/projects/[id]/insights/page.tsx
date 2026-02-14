import { redirect } from "next/navigation";

export default async function ProjectInsightsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Redirect to the main insights page, which covers all projects
  // Individual project details are available via the project detail page
  const { id } = await params;
  redirect(`/projects/${id}?tab=cpm`);
}
