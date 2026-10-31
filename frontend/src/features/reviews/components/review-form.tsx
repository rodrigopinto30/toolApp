"use client";
"use no memo";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Controller, useForm, useFormState } from "react-hook-form";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { TextField } from "@/components/form/text-field";
import { TextareaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { invalidFields, useErrorMessage } from "@/features/errors/use-error-message";
import { StarInput } from "@/features/reviews/components/star-input";
import { useCreateReview } from "@/features/reviews/hooks";
import {
  BODY_MAX_LENGTH,
  reviewSchema,
  TITLE_MAX_LENGTH,
  type ReviewValues,
} from "@/features/reviews/schemas";

const FIELDS = ["rating", "title", "body"] as const;

export function ReviewForm({
  slug,
  onSaved,
  onCancel,
}: {
  slug: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("AccountReviews.form");
  const tv = useTranslations("Validation");
  const id = useId();
  const errorMessage = useErrorMessage();
  const create = useCreateReview(slug);
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema((key) => tv(key))),
    defaultValues: { rating: 0, title: "", body: "" },
  });
  const { errors } = useFormState({ control: form.control });

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: () => onSaved(),
      onError: (error) =>
        invalidFields(error)
          .filter((name): name is (typeof FIELDS)[number] => FIELDS.some((known) => known === name))
          .forEach((name) => form.setError(name, { message: tv("invalid") })),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormAlert message={create.error ? errorMessage(create.error) : undefined} />
      <Controller
        control={form.control}
        name="rating"
        render={({ field }) => (
          <StarInput
            id={`${id}-rating`}
            name={field.name}
            legend={t("rating")}
            value={field.value}
            error={errors.rating?.message}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <TextField
        id={`${id}-title`}
        label={t("headline")}
        maxLength={TITLE_MAX_LENGTH}
        error={errors.title?.message}
        registration={form.register("title")}
      />
      <TextareaField
        id={`${id}-body`}
        label={t("body")}
        hint={t("hint")}
        rows={6}
        maxLength={BODY_MAX_LENGTH}
        error={errors.body?.message}
        registration={form.register("body")}
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={create.isPending} pendingLabel={t("submitting")}>
          {t("submit")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
