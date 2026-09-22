/**
 * Money formatting for client components that also render on the server.
 * `Intl`'s compact notation differs between Node's ICU and browsers
 * ("₹58.0L" vs "₹58L"), which breaks hydration — so compact amounts are
 * scaled and suffixed here by hand; only the full format uses Intl.
 */
const INDIAN_UNITS = [
  { value: 1e7, suffix: "Cr" },
  { value: 1e5, suffix: "L" },
  { value: 1e3, suffix: "K" },
];
const WESTERN_UNITS = [
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
];

export function moneyFormatters(currency: string) {
  const full = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  const symbol =
    full.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  const units = currency === "INR" ? INDIAN_UNITS : WESTERN_UNITS;

  return {
    full: (value: number) => full.format(value),
    compact: (value: number) => {
      const unit = units.find((u) => Math.abs(value) >= u.value);
      if (!unit) return `${symbol}${Math.round(value)}`;
      const scaled = (value / unit.value).toFixed(1).replace(/\.0$/, "");
      return `${symbol}${scaled}${unit.suffix}`;
    },
  };
}
