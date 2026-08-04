import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "../src/components/ui/MarkdownContent";

describe("MarkdownContent", () => {
  it("removes script, event-handler, and javascript URL injection from markdown", () => {
    const { container } = render(
      <MarkdownContent
        content={
          '# Safe title\n\n<script>window.compromised = true</script>\n\n[Bad link](javascript:alert(1))\n\n<img src="x" onerror="window.compromised = true" />'
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Safe title" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(screen.getByText("Bad link").closest("a")).not.toHaveAttribute(
      "href",
      "javascript:alert(1)",
    );
  });

  it("keeps safe markdown links and controlled search highlighting", () => {
    render(
      <MarkdownContent
        content="Review the [security guide](https://example.com/security)."
        highlightTerm="security"
      />,
    );

    expect(screen.getByRole("link", { name: "security guide" })).toHaveAttribute(
      "href",
      "https://example.com/security",
    );
    expect(screen.getByText("security", { selector: "mark" })).toHaveClass("search-highlight");
  });
});
