import styles from "./charts.module.css";

/*
 * The two chart shapes Reports needs, drawn in plain HTML so they render on
 * the server with no chart library and no client bundle. Thin marks, one
 * baseline, hairline grid, one tooltip per mark that lists every series and
 * shows on keyboard focus as well as hover, and a table twin under each.
 *
 * Colours: the app's own purple for the one series that matters, its data
 * lime for a second, and a neutral for context. The purple–lime pair was run
 * through the palette validator; the lime is light against white, so every
 * lime series is also direct-labelled and in the table, which is the relief
 * the validator asks for.
 */

export const chartColors = {
  primary: "#6b21a8",
  data: "#7cc00f",
  muted: "#c9ccd2",
} as const;

export type Series = { name: string; color: string };
export type Group = { label: string; values: number[] };

/** Clean axis steps: 0, half, max rounded up to a friendly number. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scaled = max / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export function ColumnChart({
  series,
  groups,
  format,
  emptyText = "Nothing in this period yet.",
}: {
  series: Series[];
  groups: Group[];
  format: (value: number) => string;
  emptyText?: string;
}) {
  const rawMax = Math.max(0, ...groups.flatMap((group) => group.values));
  if (rawMax === 0) return <p className={styles.empty}>{emptyText}</p>;
  const max = niceMax(rawMax);
  /* Direct-label only the tallest column of each series; the rest is the tooltip's and the table's. */
  const peaks = series.map((_, index) => Math.max(...groups.map((group) => group.values[index] ?? 0)));

  return (
    <figure className={styles.figure}>
      {series.length > 1 && (
        <div className={styles.legend} aria-label="Series">
          {series.map((item) => (
            <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>
          ))}
        </div>
      )}
      <div className={styles.plot} role="img" aria-label={`${series.map((s) => s.name).join(" and ")} by period`}>
        {[1, 0.5].map((fraction) => (
          <div key={fraction} className={styles.grid} style={{ bottom: `calc(22px + ${fraction * 100}% - ${fraction * 22}px)` }}>
            <span className={styles.gridLabel}>{format(max * fraction)}</span>
          </div>
        ))}
        <div className={styles.grid} style={{ bottom: 22 }} />
        {groups.map((group) => (
          <div key={group.label} className={styles.group} data-label={group.label}>
            {series.map((item, index) => {
              const value = group.values[index] ?? 0;
              const height = `${(value / max) * 100}%`;
              return (
                <div key={item.name} className={styles.col} tabIndex={0} aria-label={`${group.label}: ${item.name} ${format(value)}`}>
                  <div className={styles.fill} style={{ height, background: item.color }} />
                  {value > 0 && value === peaks[index] && <span className={styles.colLabel} style={{ bottom: height }}>{format(value)}</span>}
                  <div className={styles.tip} role="tooltip">
                    <strong>{group.label}</strong>
                    {series.map((s, i) => (
                      <div key={s.name}><i style={{ background: s.color }} /><b>{format(group.values[i] ?? 0)}</b><span>{s.name}</span></div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <details className={styles.table}>
        <summary>Table view</summary>
        <table>
          <thead><tr><th>Period</th>{series.map((item) => <th key={item.name}>{item.name}</th>)}</tr></thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.label}><td>{group.label}</td>{series.map((item, index) => <td key={item.name}>{format(group.values[index] ?? 0)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export type BarRow = { label: string; sub?: string; value: number; color?: string };

export function BarList({
  rows,
  format,
  color = chartColors.primary,
  emptyText = "Nothing to show yet.",
}: {
  rows: BarRow[];
  format: (value: number) => string;
  color?: string;
  emptyText?: string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  if (max === 0 || rows.length === 0) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <figure className={styles.figure}>
      <div className={styles.bars}>
        {rows.map((row) => (
          <div key={row.label} className={styles.bar} tabIndex={0} aria-label={`${row.label}: ${format(row.value)}`}>
            <span className={styles.barLabel}>{row.label}{row.sub && <span className={styles.barSub}>{row.sub}</span>}</span>
            <span className={styles.track}><span className={styles.barFill} style={{ width: `${(row.value / max) * 100}%`, background: row.color ?? color, display: "block" }} /></span>
            <span className={styles.barValue}>{format(row.value)}</span>
            <div className={styles.tip} role="tooltip"><strong>{row.label}</strong><div><b>{format(row.value)}</b>{row.sub && <span>{row.sub}</span>}</div></div>
          </div>
        ))}
      </div>
      <details className={styles.table}>
        <summary>Table view</summary>
        <table>
          <thead><tr><th>Item</th><th>Value</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}{row.sub ? ` · ${row.sub}` : ""}</td><td>{format(row.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

export function StatTile({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" | "flat"; upIsGood?: boolean };
  note?: string;
}) {
  const good = delta && delta.direction !== "flat" ? (delta.direction === "up") === (delta.upIsGood ?? true) : null;
  return (
    <div className="flex flex-col gap-1 px-[18px] py-4">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</span>
      <span className="font-display text-[25px] font-semibold tracking-[-0.5px] text-foreground">{value}</span>
      {delta && (
        <span className={`text-xs font-medium ${good === null ? "text-[var(--text-tertiary)]" : good ? "text-[#4d7c0f]" : "text-[#b91c1c]"}`}>
          {delta.direction === "up" ? "▲ " : delta.direction === "down" ? "▼ " : ""}{delta.text}
        </span>
      )}
      {note && <span className="text-xs text-[var(--text-tertiary)]">{note}</span>}
    </div>
  );
}
