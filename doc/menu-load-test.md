# Browser Menu Load Test

## Test case

Verify that New Order can load, search, filter, and calculate prices for a 1,000-item menu without touching the desktop SQLite database.

### Isolated fixture

- Opened a separate local browser origin in development mode; `window.pflDesktop` was unavailable.
- Wrote a synthetic catalog to that origin's `pfl-catalog-v1` localStorage key only.
- Generated 1,000 uniquely named menu items across 10 categories, then added one variation item to test variation pricing (1,001 rendered items total).
- Cleared the temporary browser-origin storage after the test. No production/browser profile or desktop database was used.

### Steps and expected results

1. Open New Order and choose **All**. All 1,001 fixture cards should render.
2. Select a test category. It should show only that category's 100 items.
3. Search for `Load Test Item 1000`. Exactly one item should match.
4. Add two `Load Test Item 0002` entries at ₹11.25 each.
5. Add two Small variations of `Load Test Pizza Variation`, where the item's base price is ₹190 and Small is ₹200.
6. Save the Parcel order. The order must use the Small variation price directly, not add it to the base price.

Expected subtotal:

```text
2 × ₹11.25 + 2 × ₹200 = ₹422.50
```

## Result

**Passed after fixing currency display precision.**

- All 1,001 cards rendered; switching from one 100-item category to All completed in approximately 191 ms in the test browser.
- Category filtering returned 100 items; the unique-name search returned one.
- Cart line prices displayed ₹11.25 and ₹200.00; subtotal/total displayed ₹422.50.
- The saved browser order contained the expected quantities and prices, with `subtotal` and `total` both equal to `422.5`.
- The prior display rounded fractional prices to whole rupees despite preserving the underlying arithmetic. New Order now displays up to two fractional digits, preventing displayed prices and totals from disagreeing with their stored values.
