import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/render";

import { ProductCard } from "./product-card";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, prefetch, children, ...props }: { href: string; prefetch?: boolean; children: React.ReactNode }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

const PRODUCT = {
  slug: "truper-nylon-wall-plugs-100",
  name: "Tarugos de nylon x100",
  short_description: "Para mampostería.",
  brand: { slug: "truper", name: "Truper" },
  image: null,
  price_from: { amount: "5075", currency: "ARS" as const },
  price_varies: true,
  compare_at: { amount: "6000", currency: "ARS" as const },
  stock_status: "in_stock" as const,
  single_variant_id: null,
  rating_avg: "0.00",
  rating_count: 0,
};

it("links the whole card to the product page and prefetches it only on intent", () => {
  renderWithProviders(<ProductCard product={PRODUCT} />);
  const link = screen.getByRole("link", { name: PRODUCT.name });

  expect(link).toHaveAttribute("href", "/products/truper-nylon-wall-plugs-100");
  expect(link).toHaveAttribute("data-prefetch", "false");
  fireEvent.focus(link);
  expect(link).toHaveAttribute("data-prefetch", "true");
  expect(screen.getByText("Truper")).toBeInTheDocument();
});

it("shows the lowest price as a starting price and the previous price for screen readers", () => {
  renderWithProviders(<ProductCard product={PRODUCT} />);

  expect(screen.getByText(/^Desde \$\s?5\.075$/)).toBeInTheDocument();
  expect(screen.getByText("Precio anterior:")).toHaveClass("sr-only");
  expect(screen.getByText(/\$\s?6\.000/)).toBeInTheDocument();
});

it("shows a single price without 'from' and flags low stock and ratings", () => {
  renderWithProviders(
    <ProductCard
      product={{
        ...PRODUCT,
        price_varies: false,
        compare_at: null,
        stock_status: "low_stock",
        rating_avg: "4.50",
        rating_count: 2,
      }}
    />,
  );

  expect(screen.getByText(/^\$\s?5\.075$/)).toBeInTheDocument();
  expect(screen.getByText("Últimas unidades")).toBeInTheDocument();
  expect(screen.getByText("4,5 de 5, 2 opiniones")).toBeInTheDocument();
});

it("marks the discount on the picture, with the full wording for screen readers", () => {
  renderWithProviders(<ProductCard product={PRODUCT} />);

  expect(screen.getByText(/^-15\s%$/)).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText(/^15\s% de descuento$/)).toHaveClass("sr-only");
});

it("adds a product with a single variant straight from the card", async () => {
  renderWithProviders(<ProductCard product={{ ...PRODUCT, price_varies: false, single_variant_id: 7 }} />);

  await userEvent.setup().click(screen.getByRole("button", { name: `Agregar al carrito: ${PRODUCT.name}` }));

  expect(await screen.findByText(`${PRODUCT.name} se agregó al carrito.`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Agregado: ${PRODUCT.name}` })).toBeInTheDocument();
});

it("sends products with options, or without stock, to their page", () => {
  const { unmount } = renderWithProviders(<ProductCard product={PRODUCT} />);

  expect(screen.getByText("Ver opciones")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Agregar al carrito/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(1);

  unmount();
  renderWithProviders(<ProductCard product={{ ...PRODUCT, single_variant_id: 7, stock_status: "out_of_stock" }} />);
  expect(screen.getByText("Ver producto")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Agregar al carrito/ })).not.toBeInTheDocument();
});
