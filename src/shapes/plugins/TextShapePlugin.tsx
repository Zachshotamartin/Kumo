import React, { useState, useRef, useEffect } from "react";
import { BaseShapePlugin } from "../base/BaseShapePlugin";
import { BaseShape, ShapeRenderContext } from "../types";

/**
 * Text shape plugin implementation with editing capabilities
 */
export class TextShapePlugin extends BaseShapePlugin {
  readonly type = "text";
  readonly name = "Text";
  readonly description = "Create editable text elements";
  readonly icon = "type";

  /**
   * Get default properties for text shapes
   */
  getDefaultProperties(): Partial<BaseShape> {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      color: "#000000",
      fontSize: 16,
      fontFamily: "Arial",
      fontWeight: "normal",
      textAlign: "left",
      text: "Double-click to edit",
    };
  }

  /**
   * Render the text shape with editing capabilities
   */
  render(context: ShapeRenderContext): React.ReactElement {
    const { shape, onMouseEnter, onMouseLeave, isSelected } = context;

    return (
      <TextShapeRenderer
        shape={shape}
        context={context}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        isSelected={isSelected}
      />
    );
  }

  /**
   * Validate text-specific properties
   */
  validate(shape: BaseShape): boolean {
    if (!super.validate(shape)) {
      return false;
    }

    // Text-specific validation
    if (
      shape.fontSize !== undefined &&
      (typeof shape.fontSize !== "number" || shape.fontSize <= 0)
    ) {
      return false;
    }

    if (shape.text !== undefined && typeof shape.text !== "string") {
      return false;
    }

    return true;
  }

  /**
   * Override computed style for text-specific rendering
   */
  public getComputedStyle(
    shape: BaseShape,
    context: ShapeRenderContext
  ): React.CSSProperties {
    const baseStyle = super.getComputedStyle(shape, context);

    return {
      ...baseStyle,
      display: "flex",
      alignItems: shape.alignItems || "flex-start",
      justifyContent: this.getJustifyContent(shape.textAlign || "left"),
      padding: "4px",
      boxSizing: "border-box",
      cursor: "text",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word",
      overflow: "hidden",
    };
  }

  /**
   * Convert textAlign to justifyContent for flexbox
   */
  private getJustifyContent(textAlign: string): string {
    switch (textAlign) {
      case "center":
        return "center";
      case "right":
        return "flex-end";
      case "justify":
        return "space-between";
      default:
        return "flex-start";
    }
  }
}

/**
 * Text Shape Renderer Component with editing functionality
 */
interface TextShapeRendererProps {
  shape: BaseShape;
  context: ShapeRenderContext;
  onMouseEnter?: (shape: BaseShape) => void;
  onMouseLeave?: () => void;
  isSelected: boolean;
}

const TextShapeRenderer: React.FC<TextShapeRendererProps> = ({
  shape,
  context,
  onMouseEnter,
  onMouseLeave,
  isSelected,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(shape.text || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plugin = new TextShapePlugin();
  const style = plugin.getComputedStyle(shape, context);

  const handleMouseEnter = () => {
    if (onMouseEnter && shape.level === 0) {
      onMouseEnter(shape);
    }
  };

  const handleMouseLeave = () => {
    if (onMouseLeave && shape.level === 0) {
      onMouseLeave();
    }
  };

  const handleDoubleClick = () => {
    if (shape.level === 0) {
      setIsEditing(true);
      setEditText(shape.text || "");
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      finishEditing();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditText(shape.text || "");
    }
  };

  const handleBlur = () => {
    finishEditing();
  };

  const finishEditing = () => {
    setIsEditing(false);
    // TODO: Dispatch action to update shape text
    // This would need to be integrated with the existing Redux store
    console.log("Text updated:", editText);
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          ...style,
          resize: "none",
          border: "2px solid #007bff",
          outline: "none",
          backgroundColor: "rgba(255, 255, 255, 0.9)",
        }}
        data-shape-type="text"
        data-shape-id={shape.id}
        data-editing="true"
      />
    );
  }

  return (
    <div
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      data-shape-type="text"
      data-shape-id={shape.id}
    >
      {shape.text || "Double-click to edit"}
    </div>
  );
};

// Export singleton instance
export const textShapePlugin = new TextShapePlugin();
