/*
Copyright (c) 2022 TalkJS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import fontUrl from "../assets/fonts/TwemojiCountryFlags.woff2"
// emoji detection code inspired by if-emoji and emoji-picker-element, with modifications.
const FONT_FAMILY =
  '"Twemoji Mozilla","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol",' +
  '"Noto Color Emoji","EmojiOne Color","Android Emoji",sans-serif';

function makeCtx() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.textBaseline = "top";
  ctx.font = `100px ${FONT_FAMILY}`;
  ctx.scale(0.01, 0.01);
  return ctx;
}

function getColor(ctx: CanvasRenderingContext2D, text: string, color: string) {
  // we're rendering to a 1px canvas so it'll be a character (or, hopefully, a
  // color emoji) scaled down to a single vague brownish pixel
  ctx.clearRect(0, 0, 100, 100);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);

  const bytes = ctx.getImageData(0, 0, 1, 1).data;
  return bytes.join(",");
}

/**
 * Detects whether the emoji in `text` is rendered as a color emoji by this
 * browser.
 *
 * Note: this is not complete for detecting support for any emoji. Notably, it
 * does not detect whether emojis that consist of two glyphs with a
 * zero-width-joiner are rendered as a single emoji or as two, because this is
 * not needed to detect country flag support.
 */
function supportsEmoji(text: string) {
  // Render `text` to a single pixel in white and in black, and then compare
  // them to each other and ensure they're the same color, and neither one is
  // black. This shows that the emoji was rendered in color, and the font color
  // was disregarded.
  const ctx = makeCtx();
  const white = getColor(ctx, text, "#fff");
  const black = getColor(ctx, text, "#000");

  // This is RGBA, so for 0,0,0, we are checking that the first RGB is not all zeroes.
  // Most of the time when unsupported this is 0,0,0,0, but on Chrome on Mac it is
  // 0,0,0,61 - there is a transparency here.
  return black === white && !black.startsWith("0,0,0,");
}

/**
 * Injects a style element into the HEAD with a web font with country flags,
 * iff the browser does support emojis but not country flags.
 *
 * @param fontName - Override the default font name ("Twemoji Country Flags")
 *
 * @returns true if the web font was loaded (ie the browser does not support country flags)
 */
export function polyfillCountryFlagEmojis(
    fontName: string = "Twemoji Country Flags"
) {
  if (
    typeof window !== "undefined" &&
    supportsEmoji("😊") &&
    !supportsEmoji("🇨🇭")
  ) {
    const style = document.createElement("style");

    style.textContent = `@font-face {
      font-family: "${fontName}";
      unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067,
        U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F;
      src: url('${fontUrl}') format('woff2');
      font-display: swap;
    }`;
    document.head.appendChild(style);

    return true;
  }
  return false;
}