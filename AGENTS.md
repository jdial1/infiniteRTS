### Territory Visualization Pattern
To create a unified "blob" with a sharp outer boundary for overlapping shapes on a HTML5 Canvas:
1. Draw the desired stroke for all shapes.
2. Use `ctx.globalCompositeOperation = 'destination-out'` and fill the same shapes to "punch out" the internal parts of the stroke.
3. Switch back to `source-over` to draw the internal fills (solid or patterns).
This technique avoids internal overlapping lines while maintaining a single cohesive outer stroke for the union of all shapes.
