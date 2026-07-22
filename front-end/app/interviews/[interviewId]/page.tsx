import Home from "@/app/page";

export default async function InterviewSessionPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const { interviewId } = await params;
  return <Home interviewSessionId={interviewId} />;
}
