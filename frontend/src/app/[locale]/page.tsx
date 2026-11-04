import { ArrowRightIcon } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { SectionHeading } from "@/components/layout/section-heading";
import { Button } from "@/components/ui/button";
import { getCategoryTree, getFeatured } from "@/features/catalog/api";
import { CategoryList } from "@/features/catalog/components/category-list";
import { ProductGrid, ProductGridSkeleton } from "@/features/catalog/components/product-grid";
import { categoryPath } from "@/features/catalog/paths";
import { CARD_NAMESPACES, clientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrency } from "@/lib/currency.server";

const FEATURED_PLACEHOLDERS = 4;

async function FeaturedProducts({ locale }: { locale: Locale }) {
  const products = await getFeatured(locale, await getCurrency());

  return <ProductGrid products={products} />;
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Home");
  const categories = await getCategoryTree(locale as Locale);
  const first = categories.at(0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pt-6 pb-12">
      <section className="overflow-hidden rounded-xl bg-chrome text-chrome-foreground shadow-sm dark:bg-chrome-secondary">
        <div className="flex flex-col items-start gap-4 px-6 py-10 sm:px-10 sm:py-14">
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight uppercase sm:text-5xl">{t("title")}</h1>
          <p className="max-w-xl text-lg text-chrome-muted">{t("subtitle")}</p>
          {first && (
            <Button
              asChild
              size="lg"
              className="mt-2 h-11 px-5 text-base focus-visible:border-brand focus-visible:ring-brand/50 focus-visible:ring-offset-chrome dark:focus-visible:ring-offset-chrome-secondary"
            >
              <Link href={categoryPath(first.slug)}>
                {t("cta", { category: first.name })}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
        <div
          aria-hidden="true"
          className="h-3 bg-[repeating-linear-gradient(-45deg,var(--brand)_0_14px,var(--chrome)_14px_28px)]"
        />
      </section>
      <section aria-labelledby="home-categories" className="flex flex-col gap-4">
        <SectionHeading id="home-categories">{t("categories")}</SectionHeading>
        <CategoryList categories={categories} />
      </section>
      <section aria-labelledby="home-featured" className="flex flex-col gap-4">
        <SectionHeading id="home-featured">{t("featured")}</SectionHeading>
        <NextIntlClientProvider messages={await clientMessages(CARD_NAMESPACES)}>
          <Suspense fallback={<ProductGridSkeleton count={FEATURED_PLACEHOLDERS} />}>
            <FeaturedProducts locale={locale as Locale} />
          </Suspense>
        </NextIntlClientProvider>
      </section>
    </div>
  );
}
