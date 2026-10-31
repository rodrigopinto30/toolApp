import { useMutation } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";

import { ImageUpload } from "./image-upload";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

function Harness({ send }: { send: (file: File) => Promise<unknown> }) {
  const upload = useMutation({ mutationFn: send });
  return <ImageUpload label="Subir una imagen" upload={upload} />;
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText("Subir una imagen"), { target: { files: [file] } });
}

function picture(type = "image/png", size = 10) {
  return new File([new Uint8Array(size)], "foto.png", { type });
}

it("uploads a valid file right after choosing it", async () => {
  const send = jest.fn().mockResolvedValue({});
  renderWithProviders(<Harness send={send} />);
  const file = picture();

  choose(file);

  await waitFor(() => expect(send).toHaveBeenCalled());
  expect(send.mock.calls[0][0]).toBe(file);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("stops a wrong type and a large file in the browser", () => {
  const send = jest.fn();
  renderWithProviders(<Harness send={send} />);

  choose(picture("application/pdf"));
  expect(screen.getByRole("alert")).toHaveTextContent("Usá una imagen JPEG, PNG o WebP.");

  choose(picture("image/png", 5_242_881));
  expect(screen.getByRole("alert")).toHaveTextContent("La imagen supera los 5 MB.");
  expect(send).not.toHaveBeenCalled();
});

it.each([
  ["invalid_image", "El archivo no es una imagen válida."],
  ["too_many_images", "Un producto admite hasta 12 imágenes."],
  ["payload_too_large", "El archivo es demasiado grande."],
])("shows the server's %s under the input", async (code, message) => {
  const send = jest.fn().mockRejectedValue(new ApiError({ status: 422, code, message: "Failed." }));
  renderWithProviders(<Harness send={send} />);

  choose(picture());

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByLabelText("Subir una imagen")).toHaveAttribute("aria-invalid", "true");
});
