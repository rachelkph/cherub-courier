import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { otherAppFullScreen, type WindowInfo } from "../src/main/fullscreen.ts";

// Bounds measured on a notched 1470x956 MacBook screen (2026-11-11).
const display = { x: 0, y: 0, width: 1470, height: 956 };
const win = (o: Partial<WindowInfo>): WindowInfo => ({ pid: 200, owner: "App", layer: 0, x: 0, y: 33, width: 1470, height: 923, ...o });
const dock = win({ owner: "Dock", pid: 50, layer: 20, y: 0, height: 956 });

describe("full-screen detection", () => {
  it("a full-screen app below the notch, with the Dock gone, is full screen", () => {
    assert.equal(otherAppFullScreen([win({})], display, 100), true);
  });
  it("full screen on a screen without a notch (covering the menu bar) counts too", () => {
    assert.equal(otherAppFullScreen([win({ y: 0, height: 956 })], display, 100), true);
  });
  it("a window filling the screen in an ordinary Space (Dock on screen) is not", () => {
    assert.equal(otherAppFullScreen([win({}), dock], display, 100), false);
  });
  it("a window that stops short of the bottom or the sides is not", () => {
    assert.equal(otherAppFullScreen([win({ height: 900 }), win({ x: 10, width: 1460 })], display, 100), false);
  });
  it("our own windows and above-normal layers are ignored", () => {
    assert.equal(otherAppFullScreen([win({ pid: 100 }), win({ layer: 3 }), win({ layer: 25 })], display, 100), false);
  });
  it("full screen on another display does not count", () => {
    assert.equal(otherAppFullScreen([win({ x: 1470, width: 1920, height: 1080 })], display, 100), false);
  });
});
