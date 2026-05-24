import sys

def main():
    with open('src/App.tsx', 'r') as f:
        content = f.read()

    # 1. Inject isPointInTerritory into App.tsx
    # We can place it before the loop function where it might be used.
    # Looking for a good place: before drawTerritory or after existing helpers.

    inject_pos = content.find("const drawTerritory =")
    if inject_pos == -1:
        print("Could not find drawTerritory in src/App.tsx")
        sys.exit(1)

    is_point_in_territory_code = """        const isPointInTerritory = (px: number, py: number, userId: string): boolean => {
          // 1. Check Base (radius 450)
          const playerBase = Object.values(store.state.buildings).find((b: any) => b.ownerId === userId && b.type === 'base');
          if (playerBase) {
            const dx = px - playerBase.x;
            const dy = py - playerBase.y;
            if (Math.sqrt(dx * dx + dy * dy) <= constants.BUILD_RANGE) return true;
          }

          // 2. Check Outposts
          const ownedOutposts = Object.values(store.state.buildings).filter((b: any) => b.ownerId === userId && b.type === 'outpost') as any[];
          const OUTPOST_BUILD_RADIUS = 400;
          const OUTPOST_SPACING = 600;

          for (const o of ownedOutposts) {
            const dx = px - o.x;
            const dy = py - o.y;
            if (Math.sqrt(dx * dx + dy * dy) <= OUTPOST_BUILD_RADIUS) return true;
          }

          // 3. Check Bridges (1D)
          for (let i = 0; i < ownedOutposts.length; i++) {
            for (let j = i + 1; j < ownedOutposts.length; j++) {
              const a = ownedOutposts[i], b = ownedOutposts[j];
              const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
              if ((Math.abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && Math.abs(dy - OUTPOST_SPACING) < 1)) {
                const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
                const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
                if (dx > dy) { if (px >= minX && px <= maxX && Math.abs(py - a.y) <= 200) return true; }
                else { if (py >= minY && py <= maxY && Math.abs(px - a.x) <= 200) return true; }
              }
            }
          }

          // 4. Check 2D Squares
          for (const o of ownedOutposts) {
            const hasTR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - o.y) < 1);
            const hasBL = ownedOutposts.some(ot => Math.abs(ot.x - o.x) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
            const hasBR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
            if (hasTR && hasBL && hasBR) {
              if (px >= o.x && px <= o.x + OUTPOST_SPACING && py >= o.y && py <= o.y + OUTPOST_SPACING) return true;
            }
          }
          return false;
        };

"""
    content = content[:inject_pos] + is_point_in_territory_code + content[inject_pos:]

    # 2. Update placement validation logic
    search_text = """                       const dx = mouse.current.x - myBase.x;
                       const dy = mouse.current.y - myBase.y;
                       const distToBas = Math.sqrt(dx * dx + dy * dy);
                       if (distToBas > 450) {
                          alert("Cannot place here! This structure is outside your territory.");
                          canPlace = false;
                       }"""

    replace_text = """                       if (!isPointInTerritory(mouse.current.x, mouse.current.y, store.me.id)) {
                          alert("Cannot place here! This structure is outside your territory.");
                          canPlace = false;
                       }"""

    if search_text in content:
        content = content.replace(search_text, replace_text)
        print("Updated placement validation logic")
    else:
        print("Could not find placement validation logic to replace")
        sys.exit(1)

    with open('src/App.tsx', 'w') as f:
        f.write(content)
    print("Successfully updated src/App.tsx with territory logic and validation")

if __name__ == "__main__":
    main()
