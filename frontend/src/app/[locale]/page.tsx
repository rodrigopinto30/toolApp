import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { getCategoryTree, getFeatured } from "@/features/catalog/api";
import { CategoryList } from "@/features/catalog/components/category-list";
import { ProductGrid, ProductGridSkeleton } from "@/features/catalog/components/product-grid";
import { CARD_NAMESPACES, clientMessages } from "@/i18n/client-messages";
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t("subtitle")}</p>
      </section>
      <section aria-labelledby="home-categories" className="flex flex-col gap-4">
        <h2 id="home-categories" className="text-xl font-semibold">
          {t("categories")}
        </h2>
        <CategoryList categories={categories} />
      </section>
      <section aria-labelledby="home-featured" className="flex flex-col gap-4">
        <h2 id="home-featured" className="text-xl font-semibold">
          {t("featured")}
        </h2>
        <NextIntlClientProvider messages={await clientMessages(CARD_NAMESPACES)}>
          <Suspense fallback={<ProductGridSkeleton count={FEATURED_PLACEHOLDERS} />}>
            <FeaturedProducts locale={locale as Locale} />
          </Suspense>
        </NextIntlClientProvider>
      </section>
    </div>
  );
}
