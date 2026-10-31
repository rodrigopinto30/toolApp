"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { useAdminList, useAdminMutation } from "@/features/admin/hooks";
import type { Locale } from "@/i18n/locales";
import { api, createBrowserApi } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema";

import type { AdminBrand, AdminCategory, AdminProduct, ProductFilters } from "./types";

type Schemas = components["schemas"];
type VariantBody = Schemas["VariantCreate"];

const PAGE_SIZE = 20;
const WHOLE_LIST_SIZE = 100;
const UPLOAD_TIMEOUT_MS = 60_000;

const uploadApi = createBrowserApi({ timeoutMs: UPLOAD_TIMEOUT_MS });

export const catalogKeys = {
  categories: ["admin", "categories"] as const,
  brands: ["admin", "brands"] as const,
  attributes: ["admin", "attributes"] as const,
  products: ["admin", "products"] as const,
  product: (id: number) => ["admin", "products", id] as const,
};

function fileBody(file: File) {
  return {
    body: { file: file as unknown as string },
    bodySerializer: (body: { file: string }) => {
      const form = new FormData();
      form.append("file", body.file);
      return form;
    },
  };
}

export function useAdminCategories() {
  const query = { size: WHOLE_LIST_SIZE };
  return useAdminList(catalogKeys.categories, query, () =>
    unwrap(api.GET("/api/v1/admin/categories", { params: { query } })),
  );
}

export function useSaveCategory(id?: number) {
  return useAdminMutation(catalogKeys.categories, (body: Schemas["CategoryCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/admin/categories", { body }))
      : unwrap(api.PATCH("/api/v1/admin/categories/{category_id}", { params: { path: { category_id: id } }, body })),
  );
}

export function useDeleteCategory() {
  return useAdminMutation(catalogKeys.categories, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/categories/{category_id}", { params: { path: { category_id: id } } })),
  );
}

export function useCategoryImage(id: number) {
  const params = { path: { category_id: id } };
  const upload = useAdminMutation(catalogKeys.categories, (file: File) =>
    unwrap(uploadApi.POST("/api/v1/admin/categories/{category_id}/image", { params, ...fileBody(file) })),
  );
  const remove = useAdminMutation<void, AdminCategory>(catalogKeys.categories, () =>
    unwrap(api.DELETE("/api/v1/admin/categories/{category_id}/image", { params })),
  );
  return { upload, remove };
}

export function useAdminBrands() {
  const query = { size: WHOLE_LIST_SIZE };
  return useAdminList(catalogKeys.brands, query, () =>
    unwrap(api.GET("/api/v1/admin/brands", { params: { query } })),
  );
}

export function useSaveBrand(id?: number) {
  return useAdminMutation(catalogKeys.brands, (body: Schemas["BrandCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/admin/brands", { body }))
      : unwrap(api.PATCH("/api/v1/admin/brands/{brand_id}", { params: { path: { brand_id: id } }, body })),
  );
}

export function useDeleteBrand() {
  return useAdminMutation(catalogKeys.brands, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/brands/{brand_id}", { params: { path: { brand_id: id } } })),
  );
}

export function useBrandLogo(id: number) {
  const params = { path: { brand_id: id } };
  const upload = useAdminMutation(catalogKeys.brands, (file: File) =>
    unwrap(uploadApi.POST("/api/v1/admin/brands/{brand_id}/logo", { params, ...fileBody(file) })),
  );
  const remove = useAdminMutation<void, AdminBrand>(catalogKeys.brands, () =>
    unwrap(api.DELETE("/api/v1/admin/brands/{brand_id}/logo", { params })),
  );
  return { upload, remove };
}

export function useAdminAttributes() {
  const query = { size: WHOLE_LIST_SIZE };
  return useAdminList(catalogKeys.attributes, query, () =>
    unwrap(api.GET("/api/v1/admin/attributes", { params: { query } })),
  );
}

export function useSaveAttribute(id?: number) {
  return useAdminMutation(catalogKeys.attributes, (body: Schemas["AttributeCreate"]) =>
    id === undefined
      ? unwrap(api.POST("/api/v1/admin/attributes", { body }))
      : unwrap(api.PATCH("/api/v1/admin/attributes/{attribute_id}", { params: { path: { attribute_id: id } }, body })),
  );
}

export function useDeleteAttribute() {
  return useAdminMutation(catalogKeys.attributes, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/attributes/{attribute_id}", { params: { path: { attribute_id: id } } })),
  );
}

export function useSaveAttributeValue(attributeId: number, id?: number) {
  return useAdminMutation(catalogKeys.attributes, (body: Schemas["AttributeValueCreate"]) =>
    id === undefined
      ? unwrap(
          api.POST("/api/v1/admin/attributes/{attribute_id}/values", {
            params: { path: { attribute_id: attributeId } },
            body,
          }),
        )
      : unwrap(
          api.PATCH("/api/v1/admin/attributes/{attribute_id}/values/{value_id}", {
            params: { path: { attribute_id: attributeId, value_id: id } },
            body,
          }),
        ),
  );
}

export function useDeleteAttributeValue(attributeId: number) {
  return useAdminMutation(catalogKeys.attributes, (id: number) =>
    unwrap(
      api.DELETE("/api/v1/admin/attributes/{attribute_id}/values/{value_id}", {
        params: { path: { attribute_id: attributeId, value_id: id } },
      }),
    ),
  );
}

export function useAdminProducts(page: number, filters: ProductFilters) {
  const locale = useLocale() as Locale;
  const query = { page, size: PAGE_SIZE, locale, ...filters };
  return useAdminList(catalogKeys.products, query, () =>
    unwrap(api.GET("/api/v1/admin/products", { params: { query } })),
  );
}

export function useAdminProduct(id: number) {
  return useQuery({
    queryKey: catalogKeys.product(id),
    queryFn: () => unwrap(api.GET("/api/v1/admin/products/{product_id}", { params: { path: { product_id: id } } })),
  });
}

export function useCreateProduct() {
  return useAdminMutation(catalogKeys.products, (body: Schemas["ProductCreate"]) =>
    unwrap(api.POST("/api/v1/admin/products", { body })),
  );
}

export function useUpdateProduct(id: number) {
  return useAdminMutation(catalogKeys.products, (body: Schemas["ProductUpdate"]) =>
    unwrap(api.PATCH("/api/v1/admin/products/{product_id}", { params: { path: { product_id: id } }, body })),
  );
}

export function useArchiveProduct(id: number) {
  return useAdminMutation<void, AdminProduct>(catalogKeys.products, () =>
    unwrap(api.POST("/api/v1/admin/products/{product_id}/archive", { params: { path: { product_id: id } } })),
  );
}

export function useSaveVariant(productId: number, variantId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, stock, ...body }: VariantBody & { version?: number }) =>
      variantId === undefined || version === undefined
        ? unwrap(
            api.POST("/api/v1/admin/products/{product_id}/variants", {
              params: { path: { product_id: productId } },
              body: { ...body, stock },
            }),
          )
        : unwrap(
            api.PATCH("/api/v1/admin/variants/{variant_id}", {
              params: { path: { variant_id: variantId } },
              body: { ...body, version },
            }),
          ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
  });
}

export function useArchiveVariant() {
  return useAdminMutation(catalogKeys.products, (id: number) =>
    unwrap(api.POST("/api/v1/admin/variants/{variant_id}/archive", { params: { path: { variant_id: id } } })),
  );
}

export function useAdjustStock(variantId: number) {
  return useAdminMutation(catalogKeys.products, (body: Schemas["StockAdjustment"]) =>
    unwrap(api.POST("/api/v1/admin/variants/{variant_id}/stock", { params: { path: { variant_id: variantId } }, body })),
  );
}

export function useUploadProductImage(productId: number) {
  return useAdminMutation(catalogKeys.products, (file: File) =>
    unwrap(
      uploadApi.POST("/api/v1/admin/products/{product_id}/images", {
        params: { path: { product_id: productId } },
        ...fileBody(file),
      }),
    ),
  );
}

export function useUpdateImage(id: number) {
  return useAdminMutation(catalogKeys.products, (body: Schemas["ImageUpdate"]) =>
    unwrap(api.PATCH("/api/v1/admin/images/{image_id}", { params: { path: { image_id: id } }, body })),
  );
}

export function useMoveImages() {
  return useAdminMutation(catalogKeys.products, async (changes: { id: number; position: number }[]) => {
    for (const { id, position } of changes) {
      await unwrap(
        api.PATCH("/api/v1/admin/images/{image_id}", { params: { path: { image_id: id } }, body: { position } }),
      );
    }
  });
}

export function useDeleteImage() {
  return useAdminMutation(catalogKeys.products, (id: number) =>
    unwrap(api.DELETE("/api/v1/admin/images/{image_id}", { params: { path: { image_id: id } } })),
  );
}
