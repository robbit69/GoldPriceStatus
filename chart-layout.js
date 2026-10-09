/* Keep extremum labels in free lanes; compress only the plotted price range. */
(function (root) {
  const layout = {
    lanes(height, safe, content) {
      const high = Math.max(safe.top + 30, content.top - 16);
      const low = Math.min(height - safe.bottom - 12, content.bottom + 34);
      const center = (high + low) / 2;
      const halfRange = Math.max(0, low - high) * .72 / 2;
      return {
        high, low,
        plotHigh: center - halfRange,
        plotLow: center + halfRange
      };
    },
    label(anchor, textWidth, width, safe, obstacles = [], fontSize = 14) {
      const left = safe.left + 12;
      const right = width - safe.right - 12;
      const length = textWidth + 22;
      const goLeft = anchor.x - left >= length || right - anchor.x < length;
      const preferred = goLeft ? anchor.x - length : anchor.x + 12;
      const candidates = [preferred, goLeft ? anchor.x + 12 : anchor.x - length,
        ...obstacles.flatMap(box => [box.left - textWidth - 8, box.right + 8])]
        .map(x => Math.max(left, Math.min(right - textWidth, x)));
      const x = candidates.find(x => !obstacles.some(box => box.width > 0 && box.height > 0 &&
        x < box.right + 4 && x + textWidth > box.left - 4 &&
        anchor.y - 6 - fontSize < box.bottom + 4 && anchor.y - 6 > box.top - 4)) ?? candidates[0];
      return { x, end: x < anchor.x ? x : x + textWidth };
    }
  };
  root.GoldChartLayout = layout;
  if (typeof module !== 'undefined') module.exports = layout;
})(globalThis);
