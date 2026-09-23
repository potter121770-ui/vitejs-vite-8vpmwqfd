# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal finance / budgeting web app (package name `finance-app`, export files named `critical_wealth_backup_*`). It is mobile-first and meant to run as a home-screen web app. The UI text and category names are in Traditional Chinese. It started from the StackBlitz Vite + React + TS template (`README.md` is still the template's boilerplate). There is no backend: all data lives in the browser's `localStorage`.

Stack: React 18, TypeScript, Vite 5, Tailwind CSS 3 (via PostCSS), `recharts` for the pie chart, `lucide-react` for icons.

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b (type-check) then vite build -> dist/
npm run preview   # serve the built dist/
npm run lint      # eslint .
```

There is no test framework and there are no tests. To check a change, use `npm run build`, which runs the type-check.

`eslint.config.js` imports `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` and `eslint`, but none of them are in `package.json`. So `npm run lint` fails until you install them. `tsconfig.app.json` has `strict: true` but turns off `noUnusedLocals` and `noUnusedParameters`.

## Architecture

Almost all of the app is in one component in `src/App.tsx` (~1450 lines). `src/main.tsx` only mounts it, and `src/index.css` only holds the Tailwind directives. `src/App.css` is leftover template CSS that nothing imports.

### Layout inside `App.tsx`
- **Types** at the top: `Transaction`, `StatsData` (the user's starting balances and goals), `MonthlyData` (raw monthly totals) and `ProcessedMonthData` (the result of the carry-forward logic).
- **Navigation**: a `useState` string `activeTab` (`dashboard` | `history` | `form` | `investment` | `settings`). There is no router. Each view is an inner function (`renderDashboardView`, `renderHistoryView`, `renderFormView`, `renderInvestmentView`, `renderSettingsView`), and the bottom nav bar switches between them.
- **Persistence**: state is created lazily from `localStorage` and written back by `useEffect`. The keys are `yupao_transactions_v4`, `yupao_stats_v4`, `yupao_budgets_v4` and `yupao_categories_v4`. Changing the shape of stored data means either staying backward compatible (for example, `initialStats` is merged over `INITIAL_STATS_DATA`) or bumping the key suffix. `handleResetApp` removes these keys by name, so a new key has to be added there too.
- **Add/edit form**: `formData` is shared by both. `handleSave` does the create and edit logic. It evaluates the amount string as an expression, because the built-in calculator keypad writes expressions like `100+50` into it. It also creates installment series: one transaction per month, all sharing a `groupId`, with notes suffixed `(i/n)`. Editing one installment updates every item in its group and shifts their dates by the same amount.
- **CSV export**: `handleExport` writes the current computed balances as a settings header, then every transaction.

### The financial engine (`stats` useMemo)
Every balance is derived from the transaction list. Nothing is stored as a running total. Changing how a transaction is classified changes all later months.

1. **Bucket by month**: each transaction goes into a `MonthlyData` bucket according to `type`, `category`, `tag` and flags. The special category strings `'收入'` (income) and `'投資'` (investment) change the behavior, and transfers get the category `'資金劃轉'`. Flags: `fromSavings`, `fromEmergency`, `isAssetLiquidation`, `investSource` (`monthly` or `cumulative`) and `transferDirection` (`to_savings`, `to_investable`, `invest_to_emergency`, `savings_to_emergency`).
2. **Fill gaps**: every month between the earliest and latest recorded month is added, so the carry-forward has no holes.
3. **Carry forward in date order**, starting from `initialStats`. The engine tracks four money pools: the month's investable budget, cumulative investable funds, savings, and the emergency fund.
   - If the month's net result (`income - expense`) is **negative**, the deficit is taken from cumulative investable funds first, then savings, then the emergency fund. Anything still uncovered is added to `unfilledDeficit`.
   - If it is **positive**, the surplus first pays off `unfilledDeficit`, then fills the emergency fund up to `emergencyGoal`. Of what remains, **90% becomes next month's investable budget** (`carryOverBudget`) and **10% goes to savings**.
   - Whatever monthly budget is left unspent is added to the cumulative investable funds.
4. The result is returned as `stats.dashboard`, which includes `pieData`, and `stats.investment`, both for `selectedMonth`.

Expenses paid from savings or the emergency fund, and all investments, do not count toward `expense`, the need/want split, or the category pie chart. They are subtracted directly from their own pool.

### Styling
Styling uses Tailwind utility classes written directly in the JSX, plus a `THEME` color constant and arbitrary values like `bg-[#C59D5F]`. Commit messages call the design style "minimalist". The app sets up the viewport meta tag and blocks pinch-zoom at runtime to make it feel like a native app. Keep touch interactions in mind: history rows use swipe-to-delete with touch handlers.
