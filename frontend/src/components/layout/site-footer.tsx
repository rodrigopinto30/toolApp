import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="bg-chrome text-chrome-muted">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-sm sm:flex-row sm:justify-between">
        <p>{t("tagline")}</p>
        <p>{t("rights", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
