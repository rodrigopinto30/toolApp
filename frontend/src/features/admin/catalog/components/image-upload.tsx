"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCEPTED_IMAGE_TYPES, imageProblem, type ImageProblem } from "@/features/admin/catalog/images";
import { useErrorMessage } from "@/features/errors/use-error-message";

export function ImageUpload({
  label,
  upload,
  disabled,
}: {
  label: string;
  upload: UseMutationResult<unknown, Error, File>;
  disabled?: boolean;
}) {
  const t = useTranslations("Admin.upload");
  const errorMessage = useErrorMessage();
  const id = useId();
  const [problem, setProblem] = useState<ImageProblem | null>(null);
  const message = problem ? t(problem) : upload.error ? errorMessage(upload.error) : undefined;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    const found = imageProblem(file);
    setProblem(found);
    if (!found) {
      upload.mutate(file);
    }
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        disabled={disabled || upload.isPending}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${hintId} ${errorId}` : hintId}
        onChange={onChange}
      />
      <p id={hintId} aria-live="polite" className="text-xs text-muted-foreground">
        {upload.isPending ? t("uploading") : t("hint")}
      </p>
      {message && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
