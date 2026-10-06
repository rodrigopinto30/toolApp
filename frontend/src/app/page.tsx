import { connection } from "next/server";

type Readiness = { status: string; checks: Record<string, string> };

async function getBackendStatus(): Promise<Readiness | null> {
  try {
    const res = await fetch(`${process.env.INTERNAL_API_URL}/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return (await res.json()) as Readiness;
  } catch {
    return null;
  }
}

export default async function Home() {
  await connection();
  const backend = await getBackendStatus();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        ToolApp
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        Infrastructure ready.
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left text-sm">
        <dt className="font-medium">API</dt>
        <dd>{backend?.status ?? "unreachable"}</dd>
        {backend &&
          Object.entries(backend.checks).map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="font-medium">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
    </main>
  );
}
