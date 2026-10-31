"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/features/admin/catalog/components/image-upload";
import {
  useDeleteImage,
  useMoveImages,
  useUpdateImage,
  useUploadProductImage,
} from "@/features/admin/catalog/hooks";
import { movedPositions, sortedImages } from "@/features/admin/catalog/images";
import { imageSchema, NO_VALUE, type ImageInput, type ImageValues } from "@/features/admin/catalog/schemas";
import type { AdminImage, AdminProduct, AdminVariant } from "@/features/admin/catalog/types";
import { FormActions, I18nFields } from "@/features/admin/components/resource-parts";
import { ResourceSheet, useResourceSheet } from "@/features/admin/components/resource-sheet";
import { ProductImage } from "@/features/catalog/components/product-image";
import { useErrorMessage } from "@/features/errors/use-error-message";
import type { Locale } from "@/i18n/locales";

const MAX_IMAGES = 12;
const THUMBNAIL_SIZES = "5rem";

function ImageForm({
  image,
  variants,
  onSaved,
  onCancel,
}: {
  image: AdminImage;
  variants: AdminVariant[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin.images");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const update = useUpdateImage(image.id);
  const form = useForm<ImageValues, unknown, ImageInput>({
    resolver: zodResolver(imageSchema((key) => tv(key))),
    defaultValues: {
      alt: image.alt ?? { es: "", en: "" },
      variant_id: image.variant_id ? String(image.variant_id) : NO_VALUE,
    },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) => update.mutate(values, { onSuccess: () => onSaved() }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={update.error ? errorMessage(update.error) : undefined} />
      <I18nFields
        id={`${id}-alt`}
        label={t("alt")}
        maxLength={120}
        es={{ registration: form.register("alt.es"), error: errors.alt?.es?.message }}
        en={{ registration: form.register("alt.en"), error: errors.alt?.en?.message }}
      />
      <Controller
        control={form.control}
        name="variant_id"
        render={({ field }) => (
          <SelectField
            id={`${id}-variant`}
            label={t("variant")}
            options={[
              { value: NO_VALUE, label: t("allVariants") },
              ...variants.map((variant) => ({ value: String(variant.id), label: variant.sku })),
            ]}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <FormActions pending={update.isPending} onCancel={onCancel} />
    </form>
  );
}

export function ImagesSection({ product }: { product: AdminProduct }) {
  const t = useTranslations("Admin.images");
  const ta = useTranslations("Admin");
  const locale = useLocale() as Locale;
  const errorMessage = useErrorMessage();
  const upload = useUploadProductImage(product.id);
  const move = useMoveImages();
  const remove = useDeleteImage();
  const sheet = useResourceSheet<AdminImage>();
  const images = sortedImages(product.images);
  const failure = move.error ?? remove.error;
  const nameOf = (index: number) => t("imageNumber", { number: index + 1 });
  const variantOf = (image: AdminImage) =>
    product.variants.find((variant) => variant.id === image.variant_id)?.sku ?? t("allVariants");

  return (
    <section aria-labelledby="admin-images" className="grid gap-4">
      <h2 id="admin-images" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <ImageUpload label={t("upload")} upload={upload} disabled={images.length >= MAX_IMAGES} />
      <FormAlert message={failure ? errorMessage(failure) : undefined} />
      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="grid gap-2">
          {images.map((image, index) => {
            const name = nameOf(index);
            return (
              <li key={image.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
                <ProductImage
                  image={{ url: image.url, alt: image.alt?.[locale] ?? "" }}
                  sizes={THUMBNAIL_SIZES}
                  className="size-20 shrink-0"
                />
                <div className="grid min-w-40 flex-1 gap-0.5 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="wrap-anywhere text-muted-foreground">{image.alt?.[locale] ?? t("noAlt")}</span>
                  <span className="text-muted-foreground">{variantOf(image)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("moveUp", { name })}
                    disabled={index === 0 || move.isPending}
                    onClick={() => move.mutate(movedPositions(images, index, -1))}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("moveDown", { name })}
                    disabled={index === images.length - 1 || move.isPending}
                    onClick={() => move.mutate(movedPositions(images, index, 1))}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={ta("editItem", { name })}
                    onClick={() => sheet.edit(image)}
                  >
                    {ta("edit")}
                  </Button>
                  <ConfirmAction
                    label={ta("delete")}
                    accessibleLabel={ta("deleteItem", { name })}
                    title={ta("deleteTitle", { name })}
                    description={t("deleteDescription")}
                    confirmLabel={ta("confirmDelete")}
                    pendingLabel={ta("deleting")}
                    cancelLabel={ta("keep")}
                    pending={remove.isPending}
                    size="sm"
                    onConfirm={(done) => remove.mutate(image.id, { onSettled: done })}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <ResourceSheet open={sheet.open} title={t("editTitle")} onClose={sheet.close}>
        {sheet.item && (
          <ImageForm
            key={sheet.item.id}
            image={sheet.item}
            variants={product.variants}
            onSaved={sheet.close}
            onCancel={sheet.close}
          />
        )}
      </ResourceSheet>
    </section>
  );
}
