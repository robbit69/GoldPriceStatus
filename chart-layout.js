/* Extremum anchors keep their time coordinate. The chart's price scale uses
   the free lanes above/below the content, so leaders cannot cross the cards. */
(function (root) {
  const layout = {
    lanes(height, safe, content) {
      return {
        high: Math.max(safe.top + 30, content.top - 16),
        low: Math.min(height - safe.bottom - 12, content.bottom + 34)
      };
    },
    label(anchor, textWidth, width, safe) {
      const left = safe.left + 12;
      const right = width - safe.right - 12;
      const length = textWidth + 22;
      const goLeft = anchor.x - left >= length || right - anchor.x < length;
      const x = Math.max(left, Math.min(right - textWidth, goLeft ? anchor.x - length : anchor.x + 12));
      return { x, end: goLeft ? x : x + textWidth };
    }
  };
  root.GoldChartLayout = layout;
  if (typeof module !== 'undefined') module.exports = layout;
})(globalThis);
