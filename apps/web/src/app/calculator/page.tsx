"use client";

import { useState, useRef } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────
const COLS = 8;
const ROWS = 20;
const COL_LABELS = Array.from({ length: COLS }, (_, i) => String.fromCharCode(65 + i));

// ── Formula Engine ─────────────────────────────────────────────────────────────
type Cells = Record<string, string>;

function expandRange(a: string, b: string): string[] {
  const c1 = a.charCodeAt(0) - 65, r1 = +a.slice(1) - 1;
  const c2 = b.charCodeAt(0) - 65, r2 = +b.slice(1) - 1;
  const out: string[] = [];
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
      out.push(String.fromCharCode(65 + c) + (r + 1));
  return out;
}

function cellNum(id: string, cells: Cells, vis: Set<string>): number {
  if (vis.has(id)) throw new Error("#REF");
  const raw = (cells[id] ?? "").trim();
  if (!raw) return 0;
  if (raw.startsWith("=")) return compute(raw.slice(1), cells, new Set([...vis, id]));
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

function compute(src: string, cells: Cells, vis: Set<string>): number {
  let i = 0;
  const ws = () => { while (i < src.length && src[i] <= " ") i++; };
  const readIdent = () => {
    let s = "";
    while (i < src.length && /[A-Z0-9]/i.test(src[i])) s += src[i++].toUpperCase();
    return s;
  };

  function parseArgs(): Array<number | string[]> {
    const list: Array<number | string[]> = [];
    ws();
    if (src[i] === ")") return list;
    for (;;) {
      ws();
      const p = i;
      if (i < src.length && /[A-Za-z]/.test(src[i])) {
        const id = readIdent(); ws();
        if (/^[A-H][1-9][0-9]*$/.test(id) && src[i] === ":") {
          i++; ws();
          const id2 = readIdent();
          list.push(expandRange(id, id2)); ws();
          if (src[i] !== ",") break;
          i++; continue;
        }
        i = p;
      }
      list.push(expr()); ws();
      if (src[i] !== ",") break;
      i++;
    }
    return list;
  }

  function evalFn(name: string, a: Array<number | string[]>): number {
    const ns: number[] = [];
    for (const x of a) {
      if (Array.isArray(x)) {
        ns.push(...x.map(id => cellNum(id, cells, vis)));
      } else {
        ns.push(x);
      }
    }
    switch (name) {
      case "SUM":     return ns.reduce((a, b) => a + b, 0);
      case "AVERAGE": case "AVG": return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
      case "MIN":     return ns.length ? Math.min(...ns) : 0;
      case "MAX":     return ns.length ? Math.max(...ns) : 0;
      case "COUNT":   return ns.length;
      case "ABS":     return Math.abs(ns[0] ?? 0);
      case "SQRT":    return Math.sqrt(Math.abs(ns[0] ?? 0));
      case "ROUND":   return +((ns[0] ?? 0).toFixed(Math.max(0, ns[1] ?? 0)));
      case "INT": case "FLOOR": return Math.floor(ns[0] ?? 0);
      case "CEIL":    return Math.ceil(ns[0] ?? 0);
      case "POWER": case "POW": return (ns[0] ?? 0) ** (ns[1] ?? 2);
      case "MOD":     return (ns[0] ?? 0) % (ns[1] ?? 1);
      case "IF":      return (ns[0] ?? 0) ? (ns[1] ?? 1) : (ns[2] ?? 0);
      case "LOG":     return ns[1] ? Math.log(ns[0] ?? 1) / Math.log(ns[1]) : Math.log10(ns[0] ?? 1);
      case "LN":      return Math.log(ns[0] ?? 1);
      case "EXP":     return Math.exp(ns[0] ?? 0);
      case "PRODUCT": return ns.reduce((a, b) => a * b, 1);
      case "PI":      return Math.PI;
      default:        throw new Error("#NAME");
    }
  }

  function primary(): number {
    ws();
    if (src[i] === "(") { i++; const v = expr(); ws(); if (src[i] === ")") i++; return v; }
    if (/\d/.test(src[i] ?? "") || (src[i] === "." && /\d/.test(src[i + 1] ?? ""))) {
      let s = ""; while (i < src.length && /[\d.]/.test(src[i])) s += src[i++]; return +s;
    }
    if (/[A-Za-z]/.test(src[i] ?? "")) {
      const id = readIdent(); ws();
      if (src[i] === "(") { i++; const a = parseArgs(); ws(); if (src[i] === ")") i++; return evalFn(id, a); }
      if (/^[A-H][1-9][0-9]*$/.test(id) && src[i] === ":") {
        i++; ws(); const id2 = readIdent();
        return expandRange(id, id2).reduce((s, x) => s + cellNum(x, cells, vis), 0);
      }
      if (/^[A-H][1-9][0-9]*$/.test(id)) return cellNum(id, cells, vis);
      if (id === "PI") return Math.PI;
      if (id === "E") return Math.E;
      throw new Error("#NAME");
    }
    throw new Error("#PARSE");
  }

  function unary(): number { ws(); if (src[i] === "-") { i++; return -unary(); } if (src[i] === "+") { i++; return unary(); } return primary(); }
  function pow(): number { let l = unary(); ws(); while (src[i] === "^") { i++; ws(); l = l ** unary(); ws(); } return l; }
  function mul(): number {
    let l = pow(); ws();
    while ("*/".includes(src[i] ?? "")) {
      const op = src[i++]; ws(); const r = pow();
      l = op === "*" ? l * r : r === 0 ? (l >= 0 ? Infinity : -Infinity) : l / r; ws();
    }
    return l;
  }
  function add(): number {
    let l = mul(); ws();
    while ("+-".includes(src[i] ?? "")) { const op = src[i++]; ws(); const r = mul(); l = op === "+" ? l + r : l - r; ws(); }
    return l;
  }
  function cmp(): number {
    let l = add(); ws();
    for (;;) {
      const t = src.slice(i, i + 2);
      let op = "";
      if ([">=", "<=", "<>"].includes(t)) { op = t; i += 2; }
      else if (i < src.length && "><".includes(src[i])) { op = src[i++]; }
      else break;
      ws(); const r = add(); ws();
      l = op === ">" ? +(l > r) : op === "<" ? +(l < r) : op === ">=" ? +(l >= r) : op === "<=" ? +(l <= r) : +(l !== r);
    }
    return l;
  }
  function expr(): number { return cmp(); }

  ws();
  return expr();
}

function renderCell(raw: string, cells: Cells, id: string): string {
  if (!raw.trim()) return "";
  if (!raw.trim().startsWith("=")) return raw.trim();
  try {
    const r = compute(raw.trim().slice(1), cells, new Set([id]));
    if (!isFinite(r)) return r > 0 ? "∞" : "-∞";
    return Number(r.toPrecision(12)).toString();
  } catch (e) {
    const msg = (e as Error).message;
    return msg.startsWith("#") ? msg : "#ERR";
  }
}

// ── Calculator ─────────────────────────────────────────────────────────────────
function Calculator() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  function press(v: string) {
    if (v === "C") { setExpr(""); setResult(null); setFresh(false); return; }
    if (v === "⌫") { if (fresh) { setExpr(""); setResult(null); setFresh(false); } else setExpr(e => e.slice(0, -1)); return; }
    if (v === "=") {
      if (!expr) return;
      try {
        const r = compute(expr, {}, new Set());
        const s = !isFinite(r) ? (r > 0 ? "∞" : "-∞") : Number(r.toPrecision(12)).toString();
        setResult(s); setFresh(true);
      } catch { setResult("Hata"); setFresh(false); }
      return;
    }
    if (fresh) {
      if (/[\d.(]/.test(v)) { setExpr(v); setResult(null); setFresh(false); return; }
      if (/[+\-*/^]/.test(v)) { setExpr((result ?? "") + v); setResult(null); setFresh(false); return; }
    }
    if (v === "±") { setExpr(e => e.startsWith("-") ? e.slice(1) : e ? "-" + e : ""); return; }
    if (v === "%") {
      try { setExpr(Number((compute(expr, {}, new Set()) / 100).toPrecision(12)).toString()); setResult(null); } catch { }
      return;
    }
    setExpr(e => e + v); setResult(null); setFresh(false);
  }

  function onKey(e: React.KeyboardEvent) {
    const k = e.key;
    if (/^\d$/.test(k) || "+-*/^().".includes(k)) { e.preventDefault(); press(k); }
    else if (k === "Enter" || k === "=") { e.preventDefault(); press("="); }
    else if (k === "Backspace") { e.preventDefault(); press("⌫"); }
    else if (k === "Escape") { e.preventDefault(); press("C"); }
  }

  const B = (label: string, val: string, cls: string, wide = false) => (
    <button key={label} onClick={() => press(val)}
      className={`h-14 rounded-xl font-medium transition-all active:scale-95 text-base ${wide ? "col-span-2 text-left px-5" : ""} ${cls}`}>
      {label}
    </button>
  );

  return (
    <div className="max-w-xs mx-auto" tabIndex={0} onKeyDown={onKey} style={{ outline: "none" }}>
      <div className="bg-gray-900 rounded-2xl p-4 mb-3 min-h-[5rem] flex flex-col items-end justify-end gap-1">
        <div className="text-gray-400 text-sm font-mono break-all text-right w-full">{expr || "0"}</div>
        {result !== null && <div className="text-white text-3xl font-light">{result}</div>}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {B("C",    "C",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
        {B("±",    "±",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
        {B("%",    "%",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
        {B("÷",    "/",  "bg-orange-400 text-white hover:bg-orange-500")}
        {B("7",    "7",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("8",    "8",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("9",    "9",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("×",    "*",  "bg-orange-400 text-white hover:bg-orange-500")}
        {B("4",    "4",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("5",    "5",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("6",    "6",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("−",    "-",  "bg-orange-400 text-white hover:bg-orange-500")}
        {B("1",    "1",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("2",    "2",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("3",    "3",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("+",    "+",  "bg-orange-400 text-white hover:bg-orange-500")}
        {B("0",    "0",  "bg-gray-100 text-gray-900 hover:bg-gray-200", true)}
        {B(".",    ".",  "bg-gray-100 text-gray-900 hover:bg-gray-200")}
        {B("=",    "=",  "bg-orange-500 text-white hover:bg-orange-600")}
        {B("(",    "(",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
        {B(")",    ")",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
        {B("xʸ",  "^",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
        {B("⌫",   "⌫",  "bg-gray-200 text-gray-800 hover:bg-gray-300")}
      </div>
    </div>
  );
}

// ── Spreadsheet ────────────────────────────────────────────────────────────────
function Spreadsheet() {
  const [cells, setCells] = useState<Cells>({});
  const [sel, setSel] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const barRef = useRef<HTMLInputElement>(null);

  function selectCell(id: string) {
    setSel(id);
    setEditVal(cells[id] ?? "");
    setTimeout(() => barRef.current?.focus(), 0);
  }

  function commit(id: string, val: string) {
    setCells(prev => {
      const next = { ...prev };
      if (!val.trim()) delete next[id]; else next[id] = val;
      return next;
    });
  }

  function nav(id: string, dr: number, dc: number) {
    commit(id, editVal);
    const c = id.charCodeAt(0) - 65, r = +id.slice(1) - 1;
    const nc = Math.max(0, Math.min(COLS - 1, c + dc));
    const nr = Math.max(0, Math.min(ROWS - 1, r + dr));
    selectCell(String.fromCharCode(65 + nc) + (nr + 1));
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!sel) return;
    if (e.key === "Enter")     { e.preventDefault(); nav(sel, 1, 0); }
    else if (e.key === "Tab")  { e.preventDefault(); nav(sel, 0, e.shiftKey ? -1 : 1); }
    else if (e.key === "ArrowDown")  { e.preventDefault(); nav(sel, 1, 0); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); nav(sel, -1, 0); }
    else if (e.key === "ArrowRight" && editVal === cells[sel]) { e.preventDefault(); nav(sel, 0, 1); }
    else if (e.key === "ArrowLeft"  && editVal === cells[sel]) { e.preventDefault(); nav(sel, 0, -1); }
    else if (e.key === "Escape") { setEditVal(cells[sel] ?? ""); barRef.current?.blur(); }
  }

  const HINTS = ["=SUM(A1:A5)", "=AVERAGE(A1:A5)", "=MIN(A1:A5)", "=MAX(A1:A5)", "=A1+B1*C1", "=IF(A1>0,B1,C1)", "=ROUND(A1,2)", "=SQRT(A1)", "=POWER(A1,2)", "=COUNT(A1:A5)"];

  return (
    <div>
      {/* Formula bar */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono bg-gray-50 border border-gray-200 px-2 py-1.5 rounded min-w-[2.5rem] text-center text-gray-600">
          {sel ?? "—"}
        </span>
        <span className="text-gray-400 text-sm italic select-none">fx</span>
        <input
          ref={barRef}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => { if (sel) commit(sel, editVal); }}
          placeholder="Değer veya =FORMÜL girin"
          disabled={!sel}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={() => { if (confirm("Tüm verileri temizle?")) { setCells({}); setSel(null); } }}
          className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 whitespace-nowrap"
        >
          Temizle
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight: "55vh" }}>
        <table className="border-collapse text-xs" style={{ tableLayout: "fixed", minWidth: "100%" }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="bg-gray-100 border border-gray-200 w-7 sticky left-0 z-30" />
              {COL_LABELS.map(c => (
                <th key={c} className="bg-gray-100 border border-gray-200 w-20 text-center text-gray-600 font-medium py-1 px-1">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, ri) => (
              <tr key={ri}>
                <td className="bg-gray-50 border border-gray-200 text-center text-gray-400 font-medium sticky left-0 z-10 select-none w-7">
                  {ri + 1}
                </td>
                {COL_LABELS.map(c => {
                  const id = c + (ri + 1);
                  const isS = sel === id;
                  const raw = cells[id] ?? "";
                  const shown = isS ? editVal : renderCell(raw, cells, id);
                  const isErr = shown.startsWith("#");
                  return (
                    <td
                      key={id}
                      onClick={() => { if (sel && sel !== id) commit(sel, editVal); selectCell(id); }}
                      className={`border border-gray-200 h-6 cursor-default p-0 overflow-hidden ${isS ? "outline outline-2 outline-blue-500 outline-offset-[-1px] bg-blue-50 relative z-10" : "hover:bg-gray-50"}`}
                    >
                      <div className={`px-1 truncate leading-6 ${isErr ? "text-red-500" : raw.startsWith("=") && !isS ? "text-blue-800" : "text-gray-900"}`}>
                        {shown}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hint chips */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HINTS.map(h => (
          <code key={h} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{h}</code>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function CalculatorPage() {
  const [tab, setTab] = useState<"calc" | "sheet">("calc");
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Hesap Araçları</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(["calc", "sheet"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${t === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "calc" ? "Hesap Makinesi" : "Mini Formüller"}
            </button>
          ))}
        </div>
      </div>
      {tab === "calc" ? <Calculator /> : <Spreadsheet />}
    </div>
  );
}
