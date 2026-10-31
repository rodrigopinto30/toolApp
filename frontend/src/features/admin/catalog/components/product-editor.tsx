"use client";

import { useLocale, useTranslations } from "next-intl";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImagesSection } from "@/features/admin/catalog/components/images-section";
import { ProductForm } from "@/features/admin/catalog/components/product-form";
import { VariantsSection } from "@/features/admin/catalog/components/variants-section";
import { useAdminProduct, useArchiveProduct, useCreateProduct, useUpdateProduct } from "@/features/admin/catalog/hooks";
import { ADMIN_PRODUCTS_PATH, adminProductPath } from "@/features/admin/catalog/paths";
import { ActiveBadge, ResourceHeader } from "@/features/admin/components/resource-parts";
import { productPath } from "@/features/catalog/paths";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";

function BackLink() {
  const t = useTranslations("Admin.products");

  return (
    <Link href={ADMIN_PRODUCTS_PATH} className="text-sm underline-offset-4 hover:underline">
      {t("back")}
    </Link>
  );
}

export function NewProductView() {
  const t = useTranslations("Admin.products");
  const router = useRouter();
  const create = useCreateProduct();

  return (
    <div className="grid gap-4">
      <BackLink />
      <ResourceHeader title={t("addTitle")} />
      <p className="text-sm text-muted-foreground">{t("newHint")}</p>
      <ProductForm save={create} onSaved={(product) => router.replace(adminProductPath(product.id))} />
    </div>
  );
}

export function ProductEditor({ id }: { id: number }) {
  const t = useTranslations("Admin.products");
  const ta = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const product = useAdminProduct(id);
  const update = useUpdateProduct(id);
  const archive = useArchiveProduct(id);
  const failure = archive.error;

  if (product.error instanceof ApiError && product.error.status === 404) {
    return (
      <div className="grid gap-4">
        <BackLink />
        <p className="rounded-lg border border-dashed px-4 py-12 text-center text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }
  if (product.error) {
    return <FormAlert message={errorMessage(product.error)} />;
  }
  if (!product.data) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  const { data } = product;

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <BackLink />
        <ResourceHeader title={data.translations[locale].name}>
          <div className="flex flex-wrap items-center gap-2">
            <ActiveBadge active={data.is_active} />
            {data.is_active ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={productPath(data.slug)}>{t("viewInStore")}</Link>
                </Button>
                <ConfirmAction
                  label={t("archive")}
                  title={t("archiveTitle")}
                  description={t("archiveDescription")}
                  confirmLabel={t("confirmArchive")}
                  pendingLabel={t("archiving")}
                  cancelLabel={ta("keep")}
                  pending={archive.isPending}
                  size="sm"
                  onConfirm={(done) => archive.mutate(undefined, { onSettled: done })}
                />
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={update.isPending}
                onClick={() => update.mutate({ is_active: true })}
              >
                {t("restore")}
              </Button>
            )}
          </div>
        </ResourceHeader>
        <FormAlert message={failure ? errorMessage(failure) : undefined} />
      </div>
      <ProductForm key={data.id} product={data} save={update} />
      <VariantsSection product={data} />
      <ImagesSection product={data} />
    </div>
  );
}
