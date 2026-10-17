import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

export default async function Loading() {
  const t = await getTranslations("Loading");

  return (
    <section
      aria-busy="true"
      aria-label={t("label")}
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-16"
    >
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-5 w-full max-w-2xl" />
      <Skeleton className="h-5 w-1/2" />
    </section>
  );
}
