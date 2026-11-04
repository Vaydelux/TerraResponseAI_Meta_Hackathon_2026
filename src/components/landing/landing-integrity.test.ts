import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";
import { MapPreview } from "./MapPreview";
import { MetaAIShowcase } from "./MetaAIShowcase";
import { FinalCTA } from "./FinalCTA";
import { DemoFlow } from "./DemoFlow";
import { WorkspaceLink } from "./WorkspaceLink";

describe("public illustration integrity", () => {
  it("labels synthetic cards and the map without claiming live incident evidence", () => {
    for (const Component of [Hero, MapPreview, MetaAIShowcase]) {
      const markup = renderToStaticMarkup(createElement(Component));
      expect(markup).toContain("AI generated, not verified");
      expect(markup).not.toMatch(/Verified Incident|Raw Contributor Evidence|Confidence:\s*\d/i);
    }
    expect(renderToStaticMarkup(createElement(MapPreview))).toContain("not live emergency information");
  });

  it("identifies the spatial highlight as an illustration, not a returned model artifact", () => {
    const markup = renderToStaticMarkup(createElement(MetaAIShowcase));
    expect(markup).toContain("not model-generated segmentation");
    expect(markup).toContain("no live inference runs on this page");
  });

  it("sends visitors to sign-in and authorized sessions to the workspace", () => {
    expect(renderToStaticMarkup(createElement(WorkspaceLink))).toContain('href="/login"');
    expect(renderToStaticMarkup(createElement(WorkspaceLink, { signedIn: true }))).toContain('href="/dashboard"');
    for (const Component of [Hero, MapPreview, FinalCTA]) {
      expect(renderToStaticMarkup(createElement(Component, { signedIn: true }))).not.toContain('href="/review"');
    }
  });

  it("offers real destinations without promising an unavailable timed video", () => {
    const cta = renderToStaticMarkup(createElement(FinalCTA));
    expect(cta).toContain('href="https://github.com/Vaydelux/TerraResponseAI_Meta_Hackathon_2026"');
    expect(cta).toContain('href="#incident-map-preview"');
    expect(renderToStaticMarkup(createElement(MapPreview))).toContain('id="incident-map-preview"');
    expect(renderToStaticMarkup(createElement(DemoFlow))).toContain('id="how-it-works"');
    expect(cta).not.toMatch(/Watch 90|live incident thread/i);
  });
});
