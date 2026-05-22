# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify_ui.spec.ts >> verify ui after refactor
- Location: verify_ui.spec.ts:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=START MATCH')
    - locator resolved to <span class="text-[10px] sm:text-xs font-bold">START MATCH</span>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <strong class="font-display tracking-widest uppercase text-lg">Logistics</strong> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    8 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <strong class="font-display tracking-widest uppercase text-lg">Logistics</strong> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <span class="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <span class="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <strong class="font-display tracking-widest uppercase text-lg">Logistics</strong> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <span class="text-[11px] font-sans font-bold text-zinc-400">Adds 50% more health to your buildings and units.</span> from <div class="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - heading "★RED OCTOBER:" [level=1] [ref=e7]
      - heading "Overlord Command" [level=2] [ref=e8]
      - generic [ref=e12]: Volkov Industries
    - generic [ref=e13]:
      - generic [ref=e14]:
        - img "Avatar" [ref=e15]
        - generic [ref=e16]:
          - generic [ref=e17]: Commander ID
          - strong [ref=e18]: Player KGga
      - generic [ref=e19]:
        - generic [ref=e20]: Credits
        - generic [ref=e21]: $100
    - generic [ref=e22]:
      - button "🗺️ Campaign" [ref=e23]:
        - generic [ref=e24]: 🗺️
        - generic [ref=e25]: Campaign
      - button "⚔️ START MATCH" [ref=e26]:
        - generic [ref=e27]: ⚔️
        - generic [ref=e28]: START MATCH
      - button "🛡️ Arsenal & Units" [ref=e29]:
        - generic [ref=e30]: 🛡️
        - generic [ref=e31]: Arsenal & Units
      - button "🏭 Base Command" [ref=e32]:
        - generic [ref=e33]: 🏭
        - generic [ref=e34]: Base Command
      - button "🌐 Global Logistics" [ref=e35]:
        - generic [ref=e36]: 🌐
        - generic [ref=e37]: Global Logistics
  - generic [ref=e38]:
    - generic [ref=e39]:
      - button "1" [ref=e42] [cursor=pointer]:
        - img [ref=e43]
        - generic [ref=e48]: "1"
      - button "Systems Manual" [ref=e49] [cursor=pointer]:
        - img [ref=e50]
    - generic [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]: Wood (MAT)
        - generic [ref=e56]:
          - text: $300
          - generic [ref=e57]: +0/S
      - generic [ref=e59]:
        - generic [ref=e60]: Stone (ORE)
        - generic [ref=e61]:
          - text: $200
          - generic [ref=e62]: +0/S
      - generic [ref=e64]:
        - generic [ref=e65]: Gold (CR)
        - generic [ref=e66]:
          - text: $100
          - generic [ref=e67]: +0/S
    - generic [ref=e68]:
      - button "Avatar Cmdr" [ref=e69] [cursor=pointer]:
        - img "Avatar" [ref=e70]
        - generic [ref=e71]: Cmdr
      - button "Base" [ref=e72] [cursor=pointer]:
        - img [ref=e73]
        - generic [ref=e75]: Base
      - button "Map" [ref=e76] [cursor=pointer]:
        - img [ref=e77]
        - generic [ref=e79]: Map
      - button "Opt" [ref=e80] [cursor=pointer]:
        - img [ref=e81]
        - generic [ref=e84]: Opt
  - generic:
    - generic: "[399, -244]"
  - generic [ref=e85]:
    - button "Miners" [ref=e86] [cursor=pointer]:
      - img [ref=e87]
      - generic [ref=e89]: Miners
    - button "Structures" [ref=e90] [cursor=pointer]:
      - img [ref=e91]
      - generic [ref=e93]: Structures
    - button "Upgrades" [ref=e94] [cursor=pointer]:
      - img [ref=e95]
      - generic [ref=e98]: Upgrades
  - generic [ref=e100]:
    - generic [ref=e101]:
      - heading "Select Doctrine" [level=2] [ref=e102]
      - paragraph [ref=e103]:
        - text: Authorize
        - strong [ref=e104]: 2 protocols
        - text: for your command.
    - generic [ref=e105]:
      - button "Velocity Increases the movement speed of all your units." [ref=e106] [cursor=pointer]:
        - strong [ref=e107]: Velocity
        - generic [ref=e108]: Increases the movement speed of all your units.
      - button "Fortitude Adds 50% more health to your buildings and units." [ref=e109] [cursor=pointer]:
        - strong [ref=e110]: Fortitude
        - generic [ref=e111]: Adds 50% more health to your buildings and units.
      - button "Logistics Reduces the cost of all units and buildings by 25%." [ref=e112] [cursor=pointer]:
        - strong [ref=e113]: Logistics
        - generic [ref=e114]: Reduces the cost of all units and buildings by 25%.
    - button "Confirm Authorization" [disabled] [ref=e116] [cursor=pointer]
  - generic:
    - generic: 100%
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  |
  3  | test('verify ui after refactor', async ({ page }) => {
  4  |   await page.goto('http://localhost:3000');
  5  |
  6  |   // Click START MATCH
> 7  |   await page.click('text=START MATCH');
     |              ^ Error: page.click: Test timeout of 30000ms exceeded.
  8  |
  9  |   // Select traits
  10 |   await page.click('text=Velocity');
  11 |   await page.click('text=Fortitude');
  12 |   await page.click('text=Confirm Authorization');
  13 |
  14 |   // Wait for game to load
  15 |   await page.waitForSelector('canvas');
  16 |
  17 |   // Open Structures
  18 |   await page.click('text=Structures');
  19 |   await page.screenshot({ path: 'v_structures.png' });
  20 |
  21 |   // Open Upgrades
  22 |   await page.click('text=Upgrades');
  23 |   await page.screenshot({ path: 'v_upgrades.png' });
  24 |
  25 |   // Open Miners
  26 |   await page.click('text=Miners');
  27 |   await page.screenshot({ path: 'v_miners.png' });
  28 | });
  29 |
```