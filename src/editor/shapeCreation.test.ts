import { createDraftShape, draftAtPoint } from "./shapeCreation";

describe("shared editor shape creation", () => {
  it("uses the full editor defaults for rectangles and constrained ellipses", () => {
    const rectangle = draftAtPoint(
      createDraftShape("rectangle", { x: 20, y: 30 }, []),
      { x: 20, y: 30 },
      { x: 120, y: 80 },
      false
    );
    const ellipse = draftAtPoint(
      createDraftShape("ellipse", { x: 20, y: 30 }, [rectangle]),
      { x: 20, y: 30 },
      { x: 120, y: 80 },
      true
    );

    expect(rectangle).toMatchObject({
      type: "rectangle",
      name: "Rectangle",
      backgroundColor: "#f4f2ed",
      borderColor: "#17181a",
      borderWidth: 1,
      width: 100,
      height: 50,
      zIndex: 1,
    });
    expect(ellipse).toMatchObject({ type: "ellipse", width: 100, height: 100, zIndex: 2 });
  });

  it("keeps vector endpoints intact for positive and negative visual slopes", () => {
    const rising = draftAtPoint(
      createDraftShape("pen", { x: 10, y: 90 }, []),
      { x: 10, y: 90 },
      { x: 110, y: 10 },
      false
    );
    const falling = draftAtPoint(
      createDraftShape("pen", { x: 10, y: 10 }, []),
      { x: 10, y: 10 },
      { x: 110, y: 90 },
      false
    );

    expect(rising.vectorPoints?.map(({ x, y }) => ({ x, y })))
      .toEqual([{ x: 10, y: 90 }, { x: 110, y: 10 }]);
    expect(falling.vectorPoints?.map(({ x, y }) => ({ x, y })))
      .toEqual([{ x: 10, y: 10 }, { x: 110, y: 90 }]);
    expect(createDraftShape("pen", { x: 0, y: 0 }, [rising])).toMatchObject({ zIndex: rising.zIndex + 1 });
  });

  it("creates frames with an opaque white fill", () => {
    const frame = draftAtPoint(
      createDraftShape("frame", { x: 10, y: 20 }, []),
      { x: 10, y: 20 },
      { x: 210, y: 140 },
      false
    );
    expect(frame).toMatchObject({
      type: "frame",
      backgroundColor: "#ffffff",
      width: 200,
      height: 120,
    });
  });

  it("applies specialized defaults for text, images, boards, and advanced primitives", () => {
    expect(createDraftShape("text", { x: 0, y: 0 }, [])).toMatchObject({ name: "Text", text: "Type something", fontSize: 18, backgroundColor: "transparent", borderWidth: 0 });
    expect(createDraftShape("image", { x: 0, y: 0 }, [])).toMatchObject({ name: "Image", backgroundColor: "transparent" });
    expect(createDraftShape("board", { x: 0, y: 0 }, [])).toMatchObject({ name: "Linked board", title: "Choose a destination", backgroundColor: "#303640" });
    const connector = createDraftShape("connector", { x: 5, y: 6 }, []);
    expect(draftAtPoint(connector, { x: 5, y: 6 }, { x: 15, y: 26 }, false)).toMatchObject({
      x1: 5, y1: 6, x2: 15, y2: 26,
      connectorStart: { anchor: "auto", x: 5, y: 6 },
      connectorEnd: { anchor: "auto", x: 15, y: 26 },
    });
  });

  it("keeps zero-length constrained drafts stable", () => {
    const draft = createDraftShape("rectangle", { x: 10, y: 10 }, []);
    expect(draftAtPoint(draft, { x: 10, y: 10 }, { x: 10, y: 10 }, true)).toMatchObject({ width: 0, height: 0 });
  });
});
