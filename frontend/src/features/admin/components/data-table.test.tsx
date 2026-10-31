import { screen, waitFor } from "@testing-library/react";

import { renderWithUrl } from "@/test/render";
import { ApiError } from "@/lib/api/errors";

import { DataTable, type Column } from "./data-table";

let search = "";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

jest.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/audit",
}));

type Row = { id: number; name: string };

const COLUMNS: Column<Row>[] = [
  { header: "Nombre", cell: (row) => row.name },
  { header: "Código", cell: (row) => `#${row.id}` },
];

function pageOf(items: Row[], page = 1, pages = 1) {
  return { items, page, size: 20, total: items.length * pages, pages };
}

function renderTable(
  query: { data?: ReturnType<typeof pageOf>; error?: unknown },
  options: Parameters<typeof renderWithUrl>[1] = {},
) {
  renderWithUrl(
    <DataTable
      label="Cupones"
      columns={COLUMNS}
      rowKey={(row) => row.id}
      query={{ data: query.data, error: query.error ?? null }}
      emptyLabel="Todavía no hay cupones."
    />,
    options,
  );
}

beforeEach(() => {
  search = "";
});

it("renders each row under its header", () => {
  renderTable({ data: pageOf([{ id: 7, name: "VERANO" }]) });

  const table = screen.getByRole("table", { name: "Cupones" });
  expect(table).toHaveTextContent("Nombre");
  expect(screen.getByRole("row", { name: "VERANO #7" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

it("shows a loading state, an empty state and an error", () => {
  renderTable({});
  expect(screen.getByLabelText("Cargando la lista…")).toHaveAttribute("aria-busy", "true");
});

it("says when there is nothing to show", () => {
  renderTable({ data: pageOf([]) });

  expect(screen.getByText("Todavía no hay cupones.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("explains a failed list", () => {
  renderTable({ error: new ApiError({ status: 404, code: "not_found", message: "Gone." }) });

  expect(screen.getByRole("alert")).toHaveTextContent("No lo encontramos");
});

it("keeps the filters in the page links", () => {
  search = "entity=coupon&page=2";
  renderTable({ data: pageOf([{ id: 7, name: "VERANO" }], 2, 3) }, { searchParams: search });

  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/admin/audit?entity=coupon&page=3");
  expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/admin/audit?entity=coupon");
});

it("moves to the last page when the current one no longer exists", async () => {
  const onUrlUpdate = jest.fn();
  renderTable({ data: { items: [], page: 3, size: 20, total: 21, pages: 2 } }, { searchParams: "?page=3", onUrlUpdate });

  await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
  expect(onUrlUpdate.mock.calls[0][0].queryString).toBe("?page=2");
});
