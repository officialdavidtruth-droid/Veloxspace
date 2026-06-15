export const CURRENCIES = [
  { code: "USD", symbol: "$",    name: "US Dollar"          },
  { code: "EUR", symbol: "€",    name: "Euro"               },
  { code: "GBP", symbol: "£",    name: "British Pound"      },
  { code: "NGN", symbol: "₦",    name: "Nigerian Naira"     },
  { code: "GHS", symbol: "GH₵",  name: "Ghanaian Cedi"      },
  { code: "ZAR", symbol: "R",    name: "South African Rand" },
  { code: "KES", symbol: "KSh",  name: "Kenyan Shilling"    },
  { code: "CAD", symbol: "CA$",  name: "Canadian Dollar"    },
  { code: "AUD", symbol: "A$",   name: "Australian Dollar"  },
  { code: "JPY", symbol: "¥",    name: "Japanese Yen"       },
  { code: "INR", symbol: "₹",    name: "Indian Rupee"       },
  { code: "BRL", symbol: "R$",   name: "Brazilian Real"     },
];

const FALLBACK: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, NGN: 1580, GHS: 15.2,
  ZAR: 18.5, KES: 129, CAD: 1.36, AUD: 1.53,
  JPY: 149, INR: 83, BRL: 4.97,
};

let _rates: Record<string, number> | null = null;
let _fetchedAt = 0;

export async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (_rates && now - _fetchedAt < 3_600_000) return _rates;

  try {
    const cached = localStorage.getItem("vs_rates");
    const ts = parseInt(localStorage.getItem("vs_rates_ts") ?? "0");
    if (cached && now - ts < 3_600_000) {
      _rates = JSON.parse(cached);
      _fetchedAt = ts;
      return _rates!;
    }
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    _rates = data.rates;
    _fetchedAt = now;
    localStorage.setItem("vs_rates", JSON.stringify(data.rates));
    localStorage.setItem("vs_rates_ts", String(now));
    return _rates!;
  } catch {
    return FALLBACK;
  }
}

export async function convertAmount(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to || !amount) return amount;
  const rates = await getExchangeRates();
  const usd = from === "USD" ? amount : amount / (rates[from] ?? 1);
  return usd * (rates[to] ?? 1);
}

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function fmtCurrency(amount: number, code: string): string {
  const sym = getCurrencySymbol(code);
  if (code === "JPY") return `${sym}${Math.round(amount).toLocaleString()}`;
  if (Math.abs(amount) >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `${sym}${(amount / 1_000).toFixed(1)}k`;
  return `${sym}${amount.toFixed(2)}`;
}