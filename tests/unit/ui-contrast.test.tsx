// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

afterEach(cleanup);
const css = readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => {
  const value = css.match(new RegExp(`${name}:\\s*(#[a-f0-9]{6})`, "i"))?.[1];
  if (!value) throw new Error(`Missing token: ${name}`);
  return value;
};
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((v) => {
      const s = parseInt(v, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(foreground: string, background: string) {
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
it.each(["--foreground", "--text-secondary", "--text-muted", "--gold-foreground"])(
  "%s meets AA for normal text even on tinted content",
  (name) => {
    for (const bg of ["#ffffff", "#f2f2f2", "#f4efe5"])
      expect(contrast(token(name), bg)).toBeGreaterThanOrEqual(4.5);
  },
);
it("retains readable sidebar text and primary button text", () => {
  expect(contrast(token("--sidebar-muted"), "#000000")).toBeGreaterThanOrEqual(4.5);
  expect(contrast("#000000", token("--gold"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("--control-border"), "#ffffff")).toBeGreaterThanOrEqual(3);
});
it("does not let OS dark preference invert light content text", () => {
  expect(css).toContain("color-scheme: light");
  expect(css).not.toContain("prefers-color-scheme: dark");
});
it("keeps active controls enabled and applies fading only to disabled states", () => {
  render(
    <>
      <Button>Aktiv</Button>
      <Button disabled>Inaktiv</Button>
    </>,
  );
  expect(screen.getByRole("button", { name: "Aktiv" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("button", { name: "Inaktiv" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Aktiv" }).className).not.toMatch(/(?:^| )opacity-/);
});
it("uses readable semantic colors for badges and empty descriptions", () => {
  render(
    <>
      <Badge variant="gold">Gewonnen</Badge>
      <EmptyState title="Keine Deals" description="Neue Deals erscheinen hier." />
    </>,
  );
  expect(screen.getByText("Gewonnen").className).toContain("text-gold-foreground");
  expect(screen.getByText("Neue Deals erscheinen hier.").className).toContain("text-muted");
});
