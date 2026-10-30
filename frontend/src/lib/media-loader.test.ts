import mediaLoader from "./media-loader";

describe("mediaLoader", () => {
  it("swaps the width of a sized file", () => {
    expect(mediaLoader({ src: "/media/products/7/abc-1280.webp", width: 320 })).toBe(
      "/media/products/7/abc-320.webp",
    );
  });

  it("leaves any other file alone", () => {
    expect(mediaLoader({ src: "/media/brands/1/logo.png", width: 320 })).toBe("/media/brands/1/logo.png");
  });
});
