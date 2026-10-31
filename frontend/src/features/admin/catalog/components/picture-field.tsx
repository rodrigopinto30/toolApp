"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/features/admin/catalog/components/image-upload";
import { ProductImage } from "@/features/catalog/components/product-image";

const PREVIEW_SIZES = "8rem";

export function PictureField({
  label,
  url,
  alt,
  upload,
  remove,
}: {
  label: string;
  url: string | null | undefined;
  alt: string;
  upload: UseMutationResult<unknown, Error, File>;
  remove: UseMutationResult<unknown, Error, void>;
}) {
  const t = useTranslations("Admin.upload");

  return (
    <div className="grid gap-3 border-t pt-4">
      {url && <ProductImage image={{ url, alt }} sizes={PREVIEW_SIZES} className="size-32" />}
      <ImageUpload label={label} upload={upload} />
      {url && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t("remove")}
        </Button>
      )}
    </div>
  );
}
