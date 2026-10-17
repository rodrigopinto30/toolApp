import { http, HttpResponse } from "msw";

import { server } from "./server";

it("intercepts fetch with the handlers of the test", async () => {
  server.use(http.get("https://localhost/api/v1/brands", () => HttpResponse.json([{ slug: "bosch" }])));

  const response = await fetch("https://localhost/api/v1/brands");

  expect(await response.json()).toEqual([{ slug: "bosch" }]);
});

it("renders into the DOM with the jest-dom matchers", () => {
  document.body.innerHTML = "<p>ToolApp</p>";

  expect(document.querySelector("p")).toHaveTextContent("ToolApp");
});
