import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, PieChart, TrendingUp, DollarSign, List, Settings, AlertCircle, Coins, Edit3, Calendar, Info, CreditCard, Calculator, Trash2, ChevronLeft, Save, ShieldCheck, CheckCircle, Coffee, Shield, Delete, X, Eye, EyeOff, Link as LinkIcon, PiggyBank, RefreshCcw, Lock, Download, AlertTriangle, Activity, Filter, Heart, ShieldAlert, Tag, ShoppingBag, Briefcase, Database } from 'lucide-react';
import { 
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip as RechartsTooltip,
  LineChart, Line, XAxis, YAxis
} from 'recharts';

// --- Type Definitions ---
type TxTag = 'need' | 'want' | 'advance' | 'income' | 'invest_monthly' | 'invest_cumulative' | 'invest_savings' | 'transfer';
type AssetKind = 'crypto' | 'equity' | 'cash' | 'other';

interface Transaction {
  id: number;
  date: string;
  category: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer' | 'adjust';
  tag: TxTag;
  note: string;
  groupId?: string;
  investSource?: 'monthly' | 'cumulative';
  fromSavings?: boolean; 
  fromEmergency?: boolean; 
  isAssetLiquidation?: boolean; 
  isLoanDisbursement?: boolean; // 學貸等借款撥款：進入現金存款，不算收入
  isDebtRepayment?: boolean;    // 償還負債：算支出（現金流出），不算需要/想要
  liability?: string;           // 對應的負債名稱
  isReimbursement?: boolean;   // 代墊還款
  asset?: string;              // 投資標的 / 變現標的
  quantity?: number;           // 買到 / 賣出的數量（選填）
  adjustTarget?: 'emergency' | 'savings' | 'cumulative'; // 餘額校正的對象（金額可為負）
  transferDirection?: 'to_savings' | 'to_investable' | 'invest_to_emergency' | 'savings_to_emergency' | 'asset_swap';
  fromAsset?: string;          // 資產轉換：從哪個標的
  fromQuantity?: number;       // 資產轉換：轉出的數量
}

interface Asset {
  name: string;
  kind: AssetKind;
  baseline: number;       // 起始金額（沒有價格資料時的備用估算）
  baseQuantity?: number;  // 起始持有數量（有價格資料時用來算市值）
  leverage?: number;      // 槓桿倍數，例如 00631L = 2
}

interface MarketData {
  prices: { [key: string]: number };
  volLong: { [key: string]: number };
  volShort: { [key: string]: number };
  corr: { [key: string]: number };
  fetchedAt: string;
}

interface Budgets {
  [key: string]: number;
}

interface StatsData {
  available: number; 
  savings: number;
  emergencyCurrent: number; 
  emergencyGoal: number;          // 固定模式：目標；自動模式：最低目標
  initialInvestable?: number; 
  savingsFloor?: number;
  emergencyMode?: 'fixed' | 'auto';
  emergencyMonths?: number;       // 自動模式：幾個月的需要支出
  cryptoCap?: number;             // 加密貨幣比例上限 (%)
  priceCsvUrl?: string;           // Google 試算表發布的 CSV 網址
  stressCrypto?: number;          // 壓力測試：加密貨幣跌幅 (%)
  stressEquity?: number;          // 壓力測試：股票跌幅 (%)
  emergencyAutoFrom?: string;     // 自動預備金從哪個月份開始生效 (YYYY-MM)，之前的月份維持固定目標
  combineCrypto?: boolean;        // 加密貨幣合併計算成本與損益（預設 true）
  baseCosts?: { [unit: string]: { cost: number; date: string } }; // 各計算單位的起始成本與平均投入日期
  liabilities?: Liability[];      // 負債清單
}

interface NetWorthPoint {
  month: string;   // YYYY-MM，同月份只保留最新一筆
  date: string;    // 記錄日期
  cash: number;    // APP 計算的現金（預備金、存款、未投資額度…）
  invest: number;  // 投資市值
  debt?: number;   // 負債（舊資料沒有此欄位，視為 0）
  total: number;   // 淨資產 = 現金 + 投資 − 負債
}

interface Liability {
  name: string;         // 例如「學貸」
  baseBalance: number;  // 設定時的餘額；之後在 APP 記錄的撥款與還款會自動增減
}

interface MonthlyData {
  income: number;            
  assetLiquidation: number; 
  reimbursement: number;
  loanDisbursement: number;
  expense: number;          
  installmentExpense: number; 
  savingsExpense: number;  
  emergencyExpense: number;
  actualInvested: number;
  investedFromMonthly: number; 
  investedFromCumulative: number; 
  transferToSavingsFromMonthly: number;    
  transferToSavingsFromCumulative: number; 
  transferToInvestable: number;
  transferInvestToEmergencyFromMonthly: number;
  transferInvestToEmergencyFromCumulative: number;
  transferSavingsToEmergency: number;
  need: number;
  want: number;
  advance: number;
  categoryMap: { [key: string]: number };
  investedByAsset: { [key: string]: number };
  liquidatedByAsset: { [key: string]: number };
  qtyBoughtByAsset: { [key: string]: number };
  qtySoldByAsset: { [key: string]: number };
  adjustEmergency: number;
  adjustSavings: number;
  adjustCumulative: number;
}

interface ProcessedMonthData extends MonthlyData {
  netIncome: number;
  monthlyMaxInvestable: number;
  monthlyRemainingInvestable: number;
  cumulativeAddOnAvailable: number;
  deficitDeductedFromCumulative: number;
  deficitDeductedFromSavings: number;
  deficitDeductedFromEmergency: number;
  accumulatedDeficit: number; 
  savings: number;
  emergencyFund: number;
  divertedToEmergency: number;
  repaidDeficit: number; 
  emergencyGoal: number;
  avgNeed: number;
  needSampleMonths: number;
  advanceOutstanding: number;
  assetTotals: { [key: string]: number };
  assetQty: { [key: string]: number };
  carryToNext: number; // 本月結餘中，保留到下個月的投資額度（90%）
}

// --- 色彩配置 (Critical Wealth Theme) ---
const THEME = {
  darkBg: '#1C1C1E',        
  darkCard: '#2C2C2E',      
  accentGold: '#C59D5F',    
  textPrimary: '#000000', 
  creamBg: '#F9F5F0',       
  bgGray: '#F2F2F7',        
  danger: '#FF3B30',        
  success: '#34C759',       
  textBlue: '#5AC8FA',      
  textGreen: '#30D158',     
  textYellow: '#FFD60A',    
  textBrown: '#8B5E3C',     
  advance: '#8E8E93',
};

// --- 初始資料 ---
const INITIAL_TRANSACTIONS: Transaction[] = [];
const INITIAL_BUDGETS: Budgets = {};
const INITIAL_STATS_DATA: StatsData = {
  available: 0, 
  savings: 0,
  emergencyCurrent: 0, 
  emergencyGoal: 0, 
  initialInvestable: 0,
  savingsFloor: 0,
  emergencyMode: 'fixed',
  emergencyMonths: 6,
  cryptoCap: 30,
  priceCsvUrl: '',
  stressCrypto: 70,
  stressEquity: 35,
  combineCrypto: true,
  baseCosts: {},
  liabilities: [{ name: '學貸', baseBalance: 0 }],
};

const DEFAULT_EXPENSE_CATEGORIES = [
  '房租', '飲食', '交通', '電子產品', '健身', '旅遊', '娛樂', '生活雜費', '教育', '醫療', '代墊'
];

const DEFAULT_ASSETS: Asset[] = [
  { name: 'BTC', kind: 'crypto', baseline: 0 },
  { name: 'ETH', kind: 'crypto', baseline: 0 },
  { name: 'VT', kind: 'equity', baseline: 0 },
  { name: '00631L', kind: 'equity', baseline: 0, leverage: 2 },
  { name: '投資現金', kind: 'cash', baseline: 0 },
];

const ASSET_KIND_LABEL: { [key in AssetKind]: string } = {
  crypto: '加密貨幣',
  equity: '股票/ETF',
  cash: '投資現金',
  other: '其他',
};

const NEED_LOOKBACK_MONTHS = 6; // 自動預備金：取最近幾個有紀錄的月份平均

const COLORS = ['#C59D5F', '#8B5E3C', '#588157', '#E9C46A', '#F4A261', '#E76F51', '#2A9D8F', '#264653', '#AAB3AB', '#B5838D'];

// --- Helper Functions ---
const formatDateToLocal = (dateObj: Date) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalDayString = () => formatDateToLocal(new Date());

const getLocalMonthString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const formatMoney = (amount: number) => amount.toLocaleString(undefined, { maximumFractionDigits: 0 });

const calcCryptoShare = (totals: { [key: string]: number }, assets: Asset[]) => {
  let crypto = 0;
  let total = 0;
  assets.forEach(a => {
    const v = totals[a.name] || 0;
    total += v;
    if (a.kind === 'crypto') crypto += v;
  });
  return total > 0 ? (crypto / total) * 100 : 0;
};

const EMPTY_MARKET: MarketData = { prices: {}, volLong: {}, volShort: {}, corr: {}, fetchedAt: '' };

// 解析試算表 Export 的兩欄 CSV：price_X / vol_long_X / vol_short_X / corr_A_B
const parseMarketCsv = (text: string): MarketData => {
  const data: MarketData = { prices: {}, volLong: {}, volShort: {}, corr: {}, fetchedAt: new Date().toISOString() };
  text.split(/\r?\n/).forEach(line => {
    const [rawKey, rawVal] = line.split(',');
    if (!rawKey || rawVal === undefined) return;
    const key = rawKey.trim().replace(/^"|"$/g, '');
    const value = Number(rawVal.trim().replace(/^"|"$/g, '').replace(/%$/, ''));
    if (!isFinite(value)) return;
    if (key.startsWith('price_')) data.prices[key.slice(6)] = value;
    else if (key.startsWith('vol_long_')) data.volLong[key.slice(9)] = value;
    else if (key.startsWith('vol_short_')) data.volShort[key.slice(10)] = value;
    else if (key.startsWith('corr_')) data.corr[key.slice(5)] = value;
  });
  return data;
};

const getCorr = (market: MarketData, a: string, b: string) => {
  if (a === b) return 1;
  const v = market.corr[`${a}_${b}`] ?? market.corr[`${b}_${a}`];
  return v === undefined ? null : v;
};

// 風險貢獻：RC_i = w_i (Σw)_i / σp²
const computeRisk = (items: { name: string; value: number }[], market: MarketData, window: 'long' | 'short', cashNames: Set<string> = new Set()) => {
  const rawVolMap = window === 'long' ? market.volLong : market.volShort;
  // 現金：波動度 0，和任何資產的相關係數視為 0
  const volMap: { [key: string]: number } = { ...rawVolMap };
  cashNames.forEach(n => { volMap[n] = 0; });
  const usable = items.filter(i => i.value > 0 && volMap[i.name] !== undefined);
  const missing = items.filter(i => i.value > 0 && volMap[i.name] === undefined).map(i => i.name);
  const total = usable.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return { portfolioVol: 0, contributions: [] as { name: string; weight: number; risk: number; vol: number }[], missing, missingCorr: false };
  let missingCorr = false;
  const w = usable.map(i => i.value / total);
  const vol = usable.map(i => volMap[i.name]);
  const cov = usable.map((a, i) => usable.map((b, j) => {
    if (i !== j && (cashNames.has(a.name) || cashNames.has(b.name))) return 0;
    const c = getCorr(market, a.name, b.name);
    if (c === null) { missingCorr = true; return 0; }
    return c * vol[i] * vol[j];
  }));
  const covW = cov.map(row => row.reduce((s, v, j) => s + v * w[j], 0));
  const variance = w.reduce((s, wi, i) => s + wi * covW[i], 0);
  const contributions = usable.map((a, i) => ({ name: a.name, weight: w[i], vol: vol[i], risk: variance > 0 ? (w[i] * covW[i]) / variance : 0 }));
  return { portfolioVol: Math.sqrt(Math.max(variance, 0)), contributions, missing, missingCorr };
};

// 年化報酬率（XIRR）：考慮每筆現金流的日期。flows 中投入為負、取回與期末市值為正
const xirr = (flows: { date: string; amount: number }[]): number | null => {
  const valid = flows.filter(f => f.amount !== 0 && !isNaN(Date.parse(f.date)));
  if (valid.length < 2 || !valid.some(f => f.amount > 0) || !valid.some(f => f.amount < 0)) return null;
  const t0 = Math.min(...valid.map(f => Date.parse(f.date)));
  const years = valid.map(f => (Date.parse(f.date) - t0) / (365 * 86400000));
  if (Math.max(...years) < 90 / 365) return null; // 期間太短，年化沒有意義
  const npv = (r: number) => valid.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);
  let lo = -0.99, hi = 10;
  let fLo = npv(lo), fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
};

const tagLabel = (tag: TxTag) => tag === 'need' ? '需要' : tag === 'want' ? '想要' : tag === 'advance' ? '代墊' : '';

// --- UI Components ---
const CardContainer = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl overflow-hidden ${className}`}>
    {children}
  </div>
);

// --- iOS 設定風格的共用元件（放在元件外面，避免每次重繪都重建而讓輸入框失去焦點）---
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-gray-500 px-4 mb-1.5">{children}</p>
);
const SectionFooter = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-gray-500 px-4 mt-1.5 leading-relaxed">{children}</p>
);
const NavRow = ({ label, detail, onClick, danger = false }: { label: string; detail?: string; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className="w-full px-4 py-3 flex items-center justify-between active:bg-gray-100 transition-colors text-left">
    <span className={`text-base ${danger ? 'text-red-500' : 'text-black'}`}>{label}</span>
    <span className="flex items-center gap-1.5 min-w-0">
      {detail && <span className="text-base text-gray-400 truncate">{detail}</span>}
      {!danger && <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180 flex-shrink-0" />}
    </span>
  </button>
);
const InputRow = ({ label, value, onChange, placeholder = '0', inputMode = 'numeric' }: { label: string; value: string | number; onChange: (v: string) => void; placeholder?: string; inputMode?: 'numeric' | 'decimal' }) => (
  <div className="px-4 py-3 flex items-center justify-between gap-4">
    <label className="text-base text-black">{label}</label>
    <input type="text" inputMode={inputMode} placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)}
      className="text-base text-right outline-none text-gray-600 bg-transparent w-32 tabular-nums" />
  </div>
);


export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [hideFuture, setHideFuture] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<'need' | 'want' | 'advance' | null>(null);
    
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');

    const preventPinch = (e: Event) => { e.preventDefault(); };
    document.addEventListener('gesturestart', preventPinch, { passive: false });
    return () => { document.removeEventListener('gesturestart', preventPinch); };
  }, []);

  const [expenseCategories, setExpenseCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_categories_v4');
      return saved ? JSON.parse(saved) : DEFAULT_EXPENSE_CATEGORIES;
    } catch (e) { return DEFAULT_EXPENSE_CATEGORIES; }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_transactions_v4');
      const parsed: Transaction[] = saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
      // 遷移：舊的「代墊」分類紀錄原本被標成需要/想要，改成代墊標籤
      return parsed.map(t =>
        t.type === 'expense' && t.category === '代墊' && (t.tag === 'need' || t.tag === 'want')
          ? { ...t, tag: 'advance' as TxTag }
          : t
      );
    } catch (e) { return INITIAL_TRANSACTIONS; }
  });
    
  const [initialStats, setInitialStats] = useState<StatsData>(() => {
    try {
      const saved = localStorage.getItem('yupao_stats_v4');
      const parsed = saved ? JSON.parse(saved) : INITIAL_STATS_DATA;
      const merged: StatsData = { ...INITIAL_STATS_DATA, ...parsed };
      // 遷移：已經開啟自動模式但沒有起始月份的，從本月開始生效，避免改寫過去月份
      if (merged.emergencyMode === 'auto' && !merged.emergencyAutoFrom) merged.emergencyAutoFrom = getLocalMonthString();
      return merged;
    } catch (e) { return INITIAL_STATS_DATA; }
  });

  const [budgets, setBudgets] = useState<Budgets>(() => {
    try {
      const saved = localStorage.getItem('yupao_budgets_v4');
      return saved ? JSON.parse(saved) : INITIAL_BUDGETS;
    } catch (e) { return INITIAL_BUDGETS; }
  });

  const [assets, setAssets] = useState<Asset[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_assets_v4');
      const parsed: Asset[] = saved ? JSON.parse(saved) : DEFAULT_ASSETS;
      // 遷移：舊資料沒有投資現金時自動補上
      return parsed.some(a => a.kind === 'cash') ? parsed : [...parsed, { name: '投資現金', kind: 'cash', baseline: 0 }];
    } catch (e) { return DEFAULT_ASSETS; }
  });

  const [market, setMarket] = useState<MarketData>(() => {
    try {
      const saved = localStorage.getItem('yupao_market_v1');
      return saved ? { ...EMPTY_MARKET, ...JSON.parse(saved) } : EMPTY_MARKET;
    } catch (e) { return EMPTY_MARKET; }
  });
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_networth_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [marketStatus, setMarketStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [marketError, setMarketError] = useState('');
  const [riskWindow, setRiskWindow] = useState<'long' | 'short'>('long');

  const [storageUsage, setStorageUsage] = useState(0);

  useEffect(() => { localStorage.setItem('yupao_transactions_v4', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('yupao_stats_v4', JSON.stringify(initialStats)); }, [initialStats]);
  useEffect(() => { localStorage.setItem('yupao_budgets_v4', JSON.stringify(budgets)); }, [budgets]);
  useEffect(() => { localStorage.setItem('yupao_categories_v4', JSON.stringify(expenseCategories)); }, [expenseCategories]);
  useEffect(() => { localStorage.setItem('yupao_assets_v4', JSON.stringify(assets)); }, [assets]);
  useEffect(() => { localStorage.setItem('yupao_market_v1', JSON.stringify(market)); }, [market]);
  useEffect(() => { localStorage.setItem('yupao_networth_v1', JSON.stringify(netWorth)); }, [netWorth]);

  const refreshMarket = async () => {
    const url = (initialStats.priceCsvUrl || '').trim();
    if (!url) { setMarketStatus('error'); setMarketError('請先到設定貼上試算表的 CSV 網址'); return; }
    setMarketStatus('loading');
    setMarketError('');
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = parseMarketCsv(await res.text());
      if (Object.keys(parsed.prices).length === 0) throw new Error('CSV 裡找不到任何 price_ 開頭的資料');
      setMarket(parsed);
      setMarketStatus('idle');
    } catch (e: any) {
      setMarketStatus('error');
      setMarketError(`更新失敗：${e?.message || '未知錯誤'}`);
    }
  };

  useEffect(() => {
    const calculateStorage = () => {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += ((localStorage[key].length + key.length) * 2);
            }
        }
        setStorageUsage(total);
    };
    calculateStorage();
  }, [transactions, budgets, initialStats, expenseCategories, assets, market]);

  // 有數量且有價格 → 用市值；否則退回「起始金額 + 投入 − 變現」的估算
  const getAssetValues = (assetTotals: { [key: string]: number }, assetQty: { [key: string]: number }) => {
    const values: { [key: string]: number } = {};
    const source: { [key: string]: 'market' | 'estimate' } = {};
    assets.forEach(a => {
      const qty = assetQty[a.name] || 0;
      if (a.kind === 'cash') { values[a.name] = qty; source[a.name] = 'market'; return; } // 現金的「數量」就是台幣金額
      const price = market.prices[a.name];
      if (qty > 0 && price !== undefined) { values[a.name] = qty * price; source[a.name] = 'market'; }
      else { values[a.name] = assetTotals[a.name] || 0; source[a.name] = 'estimate'; }
    });
    return { values, source };
  };

  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: number | null }>({ show: false, id: null });
  const [resetModal, setResetModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthString());
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetKind, setNewAssetKind] = useState<AssetKind>('crypto');
  const [qtyDrafts, setQtyDrafts] = useState<{ [key: string]: string }>({});
  const [settingsPage, setSettingsPage] = useState<string | null>(null);
  const [newLiabilityName, setNewLiabilityName] = useState('');
  const [reconcileActual, setReconcileActual] = useState('');
  const [reconcileTarget, setReconcileTarget] = useState<'emergency' | 'savings' | 'cumulative'>('emergency');

  const availableMonths = useMemo(() => {
    const months = new Set(transactions.map(t => t.date.substring(0, 7)));
    months.add(getLocalMonthString());
    return Array.from(months).sort().reverse(); 
  }, [transactions]);

  useEffect(() => {
    if (!availableMonths.includes(selectedMonth) && availableMonths.length > 0) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  const getDefaultCategory = () => {
      if (expenseCategories.includes('飲食')) return '飲食';
      return expenseCategories[0] || '一般';
  };

  const [formData, setFormData] = useState({
    date: getLocalDayString(),
    category: getDefaultCategory(),
    amount: '',
    note: '',
    tag: 'need' as 'need' | 'want' | 'advance' | 'income' | 'transfer', 
    type: 'expense' as 'income' | 'expense' | 'transfer',
    isInstallment: false, 
    installmentCount: '3',  
    installmentCalcType: 'total' as 'total' | 'monthly', 
    perMonthInput: '',
    investSource: 'monthly' as 'monthly' | 'cumulative',
    fromSavings: false, 
    fromEmergency: false, 
    isAssetLiquidation: false, 
    isReimbursement: false,
    asset: '',
    quantity: '',
    fromAsset: '',
    fromQuantity: '',
    isLoanDisbursement: false,
    isDebtRepayment: false,
    liability: '',
    transferDirection: 'to_savings' as 'to_savings' | 'to_investable' | 'invest_to_emergency' | 'savings_to_emergency' | 'asset_swap',
  });
    
  const [editingId, setEditingId] = useState<number | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (amountInputRef.current) {
        amountInputRef.current.scrollLeft = amountInputRef.current.scrollWidth;
    }
  }, [formData.amount]);

  const handleExport = () => {
    const csvRows = [];
    const { emergencyFund, emergencyGoal, cumulativeAddOnAvailable, monthlyRemainingInvestable, savings } = stats.investment;

    csvRows.push(`"=== 系統設定備份 (銜接用：當下實際數值) ==="`);
    csvRows.push(`"緊急預備金-初始金額", "${emergencyFund}"`);
    csvRows.push(`"緊急預備金-目標金額", "${emergencyGoal}"`);
    csvRows.push(`"緊急預備金-模式", "${initialStats.emergencyMode === 'auto' ? '自動' : '固定'}"`);
    csvRows.push(`"緊急預備金-月數", "${initialStats.emergencyMonths || 6}"`);
    csvRows.push(`"初始資產配置-累積可加碼資金", "${cumulativeAddOnAvailable}"`);
    csvRows.push(`"初始資產配置-當月可投資金額", "${monthlyRemainingInvestable}"`);
    csvRows.push(`"初始資產配置-現金存款", "${savings}"`);
    csvRows.push(`"大額消費保留底線", "${initialStats.savingsFloor || 0}"`);
    csvRows.push(`"加密貨幣比例上限(%)", "${initialStats.cryptoCap || 0}"`);
    assets.forEach(a => {
        csvRows.push(`"投資標的", "${a.name}", "${ASSET_KIND_LABEL[a.kind]}", "${a.baseline}", "${a.baseQuantity || 0}", "${a.leverage || 1}"`);
    });
    csvRows.push("");

    const headers = ['ID', '日期', '類型', '分類', '金額', '標籤', '備註', '資金屬性', '標的', '數量', '分期ID'];
    csvRows.push(headers.join(','));

    transactions.forEach(t => {
        let typeLabel = t.type === 'income' ? '收入' : t.type === 'transfer' ? '劃轉' : t.type === 'adjust' ? '校正' : '支出';
        let specialLabel = '一般月收支';
        
        if (t.type === 'transfer') {
             if (t.transferDirection === 'to_savings') specialLabel = '投資轉存款';
             else if (t.transferDirection === 'to_investable') specialLabel = '存款轉投資';
             else if (t.transferDirection === 'invest_to_emergency') specialLabel = '投資轉預備金';
             else if (t.transferDirection === 'savings_to_emergency') specialLabel = '存款轉預備金';
             else if (t.transferDirection === 'asset_swap') specialLabel = `資產轉換 ${t.fromAsset || ''}→${t.asset || ''}`;
        }
        else if (t.category === '投資') specialLabel = t.fromSavings ? '存款投資' : (t.investSource === 'cumulative' ? '累積資金投資' : '當月額度投資');
        else if (t.fromSavings) specialLabel = '存款支付';
        else if (t.fromEmergency) specialLabel = '預備金支付';
        else if (t.isAssetLiquidation) specialLabel = '資產變現';
        else if (t.isReimbursement) specialLabel = '代墊還款';
        else if (t.isLoanDisbursement) specialLabel = `借款撥款 ${t.liability || ''}`;
        if (t.isDebtRepayment) specialLabel = `償還負債 ${t.liability || ''}`;
        else if (t.type === 'adjust') specialLabel = `校正-${t.adjustTarget === 'savings' ? '現金存款' : t.adjustTarget === 'cumulative' ? '歷史可加碼' : '預備金'}`;

        const row = [
            t.id, t.date, typeLabel, t.category, t.amount, t.tag,
            `"${(t.note || '').replace(/"/g, '""')}"`, specialLabel, t.asset || '', t.quantity || '', t.groupId || ''
        ];
        csvRows.push(row.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `critical_wealth_backup_${getLocalDayString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- 完整備份（JSON）：可以完整還原，CSV 只適合用 Excel 查看 ---
  const importInputRef = useRef<HTMLInputElement>(null);
  const [backupMessage, setBackupMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExportBackup = () => {
    const payload = {
      app: 'critical-wealth', version: 1, exportedAt: new Date().toISOString(),
      transactions, initialStats, budgets, expenseCategories, assets, market, netWorth,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `critical_wealth_backup_${getLocalDayString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBackupMessage({ ok: true, text: `已匯出 ${transactions.length} 筆紀錄` });
  };

  const handleImportBackup = (e: { target: HTMLInputElement }) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // 讓同一個檔案可以再選一次
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || !Array.isArray(data.transactions)) throw new Error('檔案裡找不到交易紀錄');
        const ok = window.confirm(`這會用備份（${data.exportedAt ? String(data.exportedAt).substring(0, 10) : '日期不明'}，${data.transactions.length} 筆紀錄）取代目前所有資料，確定嗎？`);
        if (!ok) return;
        setTransactions(data.transactions);
        if (data.initialStats) setInitialStats({ ...INITIAL_STATS_DATA, ...data.initialStats });
        if (data.budgets) setBudgets(data.budgets);
        if (Array.isArray(data.expenseCategories)) setExpenseCategories(data.expenseCategories);
        if (Array.isArray(data.assets)) setAssets(data.assets);
        if (data.market) setMarket({ ...EMPTY_MARKET, ...data.market });
        if (Array.isArray(data.netWorth)) setNetWorth(data.netWorth);
        setBackupMessage({ ok: true, text: `已匯入 ${data.transactions.length} 筆紀錄` });
      } catch (err: any) {
        setBackupMessage({ ok: false, text: `匯入失敗：${err?.message || '檔案格式不正確'}（請選擇 .json 備份檔，CSV 無法匯入）` });
      }
    };
    reader.readAsText(file);
  };

  const handleResetApp = () => {
      localStorage.removeItem('yupao_transactions_v4');
      localStorage.removeItem('yupao_stats_v4');
      localStorage.removeItem('yupao_budgets_v4');
      localStorage.removeItem('yupao_categories_v4'); 
      localStorage.removeItem('yupao_assets_v4');
      localStorage.removeItem('yupao_market_v1');
      localStorage.removeItem('yupao_networth_v1');
      window.location.reload();
  };

  const handleCalcInput = (key: string) => {
    const currentValue = formData.amount;
    let newValue = currentValue;

    if (key === 'AC') {
        newValue = '';
    } else if (key === 'DEL') {
        newValue = currentValue.length > 0 ? currentValue.slice(0, -1) : '';
    } else if (key === '%') {
        try {
            if (currentValue) {
                const cleanValue = currentValue.replace(/[^0-9+\-*/.]/g, '');
                // eslint-disable-next-line no-new-func
                const result = new Function('return ' + cleanValue)();
                newValue = String(Math.round(Number(result) * 100) / 10000);
            }
        } catch(e) { newValue = currentValue; }
    } else if (key === '=') {
        try {
            let cleanValue = currentValue.replace(/[^0-9+\-*/.]/g, '');
            if (['+', '-', '*', '/'].includes(cleanValue.slice(-1))) {
                cleanValue = cleanValue.slice(0, -1);
            }
            if (cleanValue) {
                // eslint-disable-next-line no-new-func
                const result = new Function('return ' + cleanValue)();
                newValue = String(Math.floor(Number(result)));
            }
            setIsCalculatorOpen(false);
        } catch (e) {
            newValue = currentValue; 
        }
    } else {
        if (currentValue === '0' && !['+', '-', '*', '/', '.'].includes(key)) {
            newValue = key;
        } else {
            const isOperator = ['+', '-', '*', '/'].includes(key);
            const lastChar = currentValue.slice(-1);
            const isLastOperator = ['+', '-', '*', '/'].includes(lastChar);
            if (isOperator && isLastOperator) newValue = currentValue.slice(0, -1) + key;
            else newValue = currentValue + key;
        }
    }
    setFormData(prev => ({ ...prev, amount: newValue }));
  };

  const openCalculator = () => {
      if (formData.installmentCalcType === 'monthly' && formData.isInstallment) return;
      setIsCalculatorOpen(true);
      setTimeout(() => {
          if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
  };

  const stats = useMemo(() => {
    const monthlyRawData: { [key: string]: MonthlyData } = {};
    
    const initMonthObj = (): MonthlyData => ({
        income: 0, assetLiquidation: 0, reimbursement: 0, loanDisbursement: 0, expense: 0, installmentExpense: 0, savingsExpense: 0, emergencyExpense: 0, 
        actualInvested: 0, investedFromMonthly: 0, investedFromCumulative: 0, 
        transferToSavingsFromMonthly: 0, transferToSavingsFromCumulative: 0, transferToInvestable: 0, 
        transferInvestToEmergencyFromMonthly: 0, transferInvestToEmergencyFromCumulative: 0, transferSavingsToEmergency: 0,
        need: 0, want: 0, advance: 0, categoryMap: {}, investedByAsset: {}, liquidatedByAsset: {},
        qtyBoughtByAsset: {}, qtySoldByAsset: {},
        adjustEmergency: 0, adjustSavings: 0, adjustCumulative: 0
    });

    availableMonths.forEach(m => { monthlyRawData[m] = initMonthObj(); });

    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7);
      if (!monthlyRawData[monthKey]) monthlyRawData[monthKey] = initMonthObj();
      const m = monthlyRawData[monthKey];
      
      const amount = Number(t.amount);
      
      if (t.type === 'adjust') {
          if (t.adjustTarget === 'savings') m.adjustSavings += amount;
          else if (t.adjustTarget === 'cumulative') m.adjustCumulative += amount;
          else m.adjustEmergency += amount;
      } else if (t.type === 'transfer') {
          if (t.transferDirection === 'to_savings') {
              if (t.investSource === 'monthly') m.transferToSavingsFromMonthly += amount;
              else m.transferToSavingsFromCumulative += amount;
          } else if (t.transferDirection === 'to_investable') {
              m.transferToInvestable += amount;
          } else if (t.transferDirection === 'invest_to_emergency') {
              if (t.investSource === 'monthly') m.transferInvestToEmergencyFromMonthly += amount;
              else m.transferInvestToEmergencyFromCumulative += amount;
          } else if (t.transferDirection === 'savings_to_emergency') {
              m.transferSavingsToEmergency += amount;
          } else if (t.transferDirection === 'asset_swap') {
              // 資產轉換：只改變標的之間的配置，不影響任何預算或現金池
              if (t.asset) m.investedByAsset[t.asset] = (m.investedByAsset[t.asset] || 0) + amount;
              if (t.fromAsset) m.liquidatedByAsset[t.fromAsset] = (m.liquidatedByAsset[t.fromAsset] || 0) + amount;
              if (t.asset && t.quantity) m.qtyBoughtByAsset[t.asset] = (m.qtyBoughtByAsset[t.asset] || 0) + t.quantity;
              if (t.fromAsset && t.fromQuantity) m.qtySoldByAsset[t.fromAsset] = (m.qtySoldByAsset[t.fromAsset] || 0) + t.fromQuantity;
          }
      } else if (t.category === '收入') {
        if (t.isLoanDisbursement) {
            m.loanDisbursement += amount; // 借來的錢：進現金存款，不列入結餘
        } else if (t.isAssetLiquidation) {
            m.assetLiquidation += amount;
            if (t.asset) m.liquidatedByAsset[t.asset] = (m.liquidatedByAsset[t.asset] || 0) + amount;
            if (t.asset && t.quantity) m.qtySoldByAsset[t.asset] = (m.qtySoldByAsset[t.asset] || 0) + t.quantity;
        } else {
            // 代墊還款以現金基礎計入收入，同時用來沖銷未收回的代墊
            m.income += amount;
            if (t.isReimbursement) m.reimbursement += amount;
        }
      } else if (t.category === '投資') {
        m.actualInvested += amount;
        if (t.asset) m.investedByAsset[t.asset] = (m.investedByAsset[t.asset] || 0) + amount;
        if (t.asset && t.quantity) m.qtyBoughtByAsset[t.asset] = (m.qtyBoughtByAsset[t.asset] || 0) + t.quantity;
        
        if (t.tag === 'invest_savings' || t.fromSavings) {
             m.savingsExpense += amount;
        } else if (t.investSource === 'cumulative') {
             m.investedFromCumulative += amount;
        } else {
             m.investedFromMonthly += amount;
        }
      } else {
        if (t.tag === 'advance') m.advance += amount;

        if (t.fromSavings) m.savingsExpense += amount;
        else if (t.fromEmergency) m.emergencyExpense += amount;
        else {
            // 代墊仍是實際流出的現金，所以計入 expense（保守：錢回來前不會變成可投資額度），
            // 但不計入需要/想要
            m.expense += amount;
            if (t.groupId) m.installmentExpense += amount;
            if (!t.isDebtRepayment && t.tag === 'need') m.need += amount;
            else if (!t.isDebtRepayment && t.tag === 'want') m.want += amount;
        }
        if (!m.categoryMap[t.category]) m.categoryMap[t.category] = 0;
        m.categoryMap[t.category] += amount;
      }
    });

    const allRecordedMonths = Object.keys(monthlyRawData).sort();
    if (allRecordedMonths.length > 0) {
        const [minY, minM] = allRecordedMonths[0].split('-').map(Number);
        const [maxY, maxM] = allRecordedMonths[allRecordedMonths.length - 1].split('-').map(Number);
        let curY = minY, curM = minM;
        
        while (curY < maxY || (curY === maxY && curM <= maxM)) {
            const key = `${curY}-${String(curM).padStart(2, '0')}`;
            if (!monthlyRawData[key]) monthlyRawData[key] = initMonthObj();
            curM++;
            if (curM > 12) { curM = 1; curY++; }
        }
    }

    const sortedMonthsAsc = Object.keys(monthlyRawData).sort(); 
    let cumulativeInvestable = initialStats.available || 0; 
    let cumulativeSavings = initialStats.savings || 0;
    let runningEmergencyFund = initialStats.emergencyCurrent || 0; 
    const fixedEmergencyGoal = initialStats.emergencyGoal || 0;
    const isAutoEmergency = initialStats.emergencyMode === 'auto';
    const emergencyMonths = initialStats.emergencyMonths || 6;
    let carryOverBudget = initialStats.initialInvestable || 0; 
    let unfilledDeficit = 0;
    let runningAdvance = 0;
    const needHistory: number[] = [];
    const initialAssetTotals: { [key: string]: number } = {};
    assets.forEach(a => { initialAssetTotals[a.name] = a.baseline || 0; });
    const assetTotals: { [key: string]: number } = { ...initialAssetTotals };
    const initialAssetQty: { [key: string]: number } = {};
    assets.forEach(a => { initialAssetQty[a.name] = a.baseQuantity || 0; });
    const assetQty: { [key: string]: number } = { ...initialAssetQty };
    const processedMonthsData: { [key: string]: ProcessedMonthData } = {};

    // 自動預備金：只用「之前」月份的需要支出，避免當月還沒記完造成低估
    const autoFrom = initialStats.emergencyAutoFrom || getLocalMonthString();
    // 自動目標只從開啟的月份起生效；過去的月份維持當時的固定目標，歷史不會被重新分配
    const computeEmergencyGoal = (month: string) => {
        const recent = needHistory.filter(v => v > 0).slice(-NEED_LOOKBACK_MONTHS);
        const avgNeed = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
        const autoGoal = Math.round(avgNeed * emergencyMonths);
        const goal = isAutoEmergency && month >= autoFrom && avgNeed > 0 ? Math.max(fixedEmergencyGoal, autoGoal) : fixedEmergencyGoal;
        return { goal, avgNeed, sampleMonths: recent.length };
    };

    sortedMonthsAsc.forEach(month => {
      const data = monthlyRawData[month];
      const { goal: emergencyGoal, avgNeed, sampleMonths } = computeEmergencyGoal(month);
      
      let monthlyMaxInvestable = carryOverBudget; 
      let currentMonthMonthlyRemaining = monthlyMaxInvestable;
      let currentMonthCumulativeRemaining = cumulativeInvestable + data.adjustCumulative;
      
      runningEmergencyFund -= data.emergencyExpense;
      runningEmergencyFund += data.adjustEmergency;
      cumulativeSavings += data.adjustSavings;
      cumulativeSavings = cumulativeSavings + data.assetLiquidation + data.loanDisbursement - data.savingsExpense;
      
      currentMonthMonthlyRemaining -= data.investedFromMonthly;
      currentMonthCumulativeRemaining -= data.investedFromCumulative;
      
      cumulativeSavings += (data.transferToSavingsFromMonthly + data.transferToSavingsFromCumulative);
      currentMonthMonthlyRemaining -= data.transferToSavingsFromMonthly;
      currentMonthCumulativeRemaining -= data.transferToSavingsFromCumulative;
      currentMonthCumulativeRemaining += data.transferToInvestable;
      cumulativeSavings -= data.transferToInvestable;
      runningEmergencyFund += (data.transferInvestToEmergencyFromMonthly + data.transferInvestToEmergencyFromCumulative + data.transferSavingsToEmergency);
      currentMonthMonthlyRemaining -= data.transferInvestToEmergencyFromMonthly;
      currentMonthCumulativeRemaining -= data.transferInvestToEmergencyFromCumulative;
      cumulativeSavings -= data.transferSavingsToEmergency;

      const netIncome = data.income - data.expense; 
      
      let surplusForNextMonth = 0; 
      let currentMonthSavingsAddon = 0; 
      let divertedToEmergency = 0; 
      let repaidDeficit = 0;
      let deficitDeductedFromCumulative = 0;
      let deficitDeductedFromSavings = 0;
      let deficitDeductedFromEmergency = 0;
        
      if (netIncome < 0) {
        let deficitToCover = Math.abs(netIncome);
        
        if (deficitToCover > 0 && currentMonthCumulativeRemaining > 0) {
            const deduct = Math.min(deficitToCover, currentMonthCumulativeRemaining);
            currentMonthCumulativeRemaining -= deduct;
            deficitToCover -= deduct;
            deficitDeductedFromCumulative += deduct;
        }
        if (deficitToCover > 0 && cumulativeSavings > 0) {
            const deduct = Math.min(deficitToCover, cumulativeSavings);
            cumulativeSavings -= deduct;
            deficitToCover -= deduct;
            deficitDeductedFromSavings += deduct;
        }
        if (deficitToCover > 0 && runningEmergencyFund > 0) {
            const deduct = Math.min(deficitToCover, runningEmergencyFund);
            runningEmergencyFund -= deduct;
            deficitToCover -= deduct;
            deficitDeductedFromEmergency += deduct;
        }
        unfilledDeficit += deficitToCover; 
      } else {
        let availableSurplus = netIncome;
        
        if (unfilledDeficit > 0) {
              const repayAmount = Math.min(availableSurplus, unfilledDeficit);
              availableSurplus -= repayAmount;
              unfilledDeficit -= repayAmount;
              repaidDeficit = repayAmount;
        }
        
        const emergencyGap = Math.max(0, emergencyGoal - runningEmergencyFund);
        if (availableSurplus > 0 && emergencyGap > 0) {
            const fillAmount = Math.min(availableSurplus, emergencyGap);
            availableSurplus -= fillAmount;
            runningEmergencyFund += fillAmount;
            divertedToEmergency = fillAmount;
        }
        
        if (availableSurplus > 0) {
            surplusForNextMonth = availableSurplus * 0.9;
            currentMonthSavingsAddon = availableSurplus * 0.1;
            cumulativeSavings += currentMonthSavingsAddon;
        }
      }
      
      cumulativeInvestable = currentMonthCumulativeRemaining + currentMonthMonthlyRemaining;
      carryOverBudget = surplusForNextMonth;

      needHistory.push(data.need);
      runningAdvance = Math.max(0, runningAdvance + data.advance - data.reimbursement);
      Object.entries(data.investedByAsset).forEach(([k, v]) => { assetTotals[k] = (assetTotals[k] || 0) + v; });
      Object.entries(data.liquidatedByAsset).forEach(([k, v]) => { assetTotals[k] = Math.max(0, (assetTotals[k] || 0) - v); });
      Object.entries(data.qtyBoughtByAsset).forEach(([k, v]) => { assetQty[k] = (assetQty[k] || 0) + v; });
      Object.entries(data.qtySoldByAsset).forEach(([k, v]) => { assetQty[k] = Math.max(0, (assetQty[k] || 0) - v); });

      processedMonthsData[month] = {
          ...data,
          netIncome,
          monthlyMaxInvestable,
          monthlyRemainingInvestable: currentMonthMonthlyRemaining,
          cumulativeAddOnAvailable: currentMonthCumulativeRemaining, 
          deficitDeductedFromCumulative,
          deficitDeductedFromSavings,
          deficitDeductedFromEmergency,
          accumulatedDeficit: unfilledDeficit,
          savings: cumulativeSavings,
          emergencyFund: runningEmergencyFund,
          divertedToEmergency,
          repaidDeficit,
          carryToNext: surplusForNextMonth,
          emergencyGoal,
          avgNeed,
          needSampleMonths: sampleMonths,
          advanceOutstanding: runningAdvance,
          assetTotals: { ...assetTotals },
          assetQty: { ...assetQty },
      };
    });

    const firstMonth = sortedMonthsAsc[0];

    // 取得任一月份的狀態（表單依「交易日期」的月份查詢，而不是畫面上選的月份）
    const getMonthStats = (month: string): ProcessedMonthData => {
        if (processedMonthsData[month]) return processedMonthsData[month];

        if (firstMonth !== undefined && month < firstMonth) {
            const initialMonthly = initialStats.initialInvestable || 0;
            return {
                ...initMonthObj(),
                netIncome: 0,
                monthlyMaxInvestable: initialMonthly,
                monthlyRemainingInvestable: initialMonthly,
                cumulativeAddOnAvailable: initialStats.available || 0,
                deficitDeductedFromCumulative: 0,
                deficitDeductedFromSavings: 0,
                deficitDeductedFromEmergency: 0,
                accumulatedDeficit: 0,
                savings: initialStats.savings || 0,
                emergencyFund: initialStats.emergencyCurrent || 0,
                divertedToEmergency: 0,
                repaidDeficit: 0,
                emergencyGoal: fixedEmergencyGoal,
                avgNeed: 0,
                needSampleMonths: 0,
                advanceOutstanding: 0,
                assetTotals: { ...initialAssetTotals },
                assetQty: { ...initialAssetQty },
                carryToNext: 0,
            };
        }

        const next = computeEmergencyGoal(month);
        return {
            ...initMonthObj(),
            netIncome: 0,
            monthlyMaxInvestable: carryOverBudget,
            monthlyRemainingInvestable: carryOverBudget,
            cumulativeAddOnAvailable: cumulativeInvestable,
            deficitDeductedFromCumulative: 0,
            deficitDeductedFromSavings: 0,
            deficitDeductedFromEmergency: 0,
            accumulatedDeficit: unfilledDeficit,
            savings: cumulativeSavings,
            emergencyFund: runningEmergencyFund,
            divertedToEmergency: 0,
            repaidDeficit: 0,
            emergencyGoal: next.goal,
            avgNeed: next.avgNeed,
            needSampleMonths: next.sampleMonths,
            advanceOutstanding: runningAdvance,
            assetTotals: { ...assetTotals },
            assetQty: { ...assetQty },
            carryToNext: 0,
        };
    };

    const currentData = getMonthStats(selectedMonth);

    const pieData = Object.keys(currentData.categoryMap)
      .map(key => ({ name: key, value: currentData.categoryMap[key] }))
      .sort((a, b) => b.value - a.value);

    return { dashboard: { ...currentData, pieData }, investment: currentData, getMonthStats };
  }, [transactions, initialStats, selectedMonth, availableMonths, assets]);

  // ================= 投資損益與淨資產 =================
  const CRYPTO_UNIT = '加密貨幣';

  // 計算單位：加密貨幣合併時，所有加密貨幣共用一個成本；其他標的各自計算
  const unitOf = (assetName: string) => {
    const a = assets.find(x => x.name === assetName);
    if (a && a.kind === 'crypto' && initialStats.combineCrypto !== false) return CRYPTO_UNIT;
    return assetName;
  };

  // APP 認為你手上的現金（和餘額校正卡片的算法一致）
  const getAppCashTotal = (d: ProcessedMonthData) =>
    d.emergencyFund + d.savings + d.cumulativeAddOnAvailable + d.monthlyRemainingInvestable + (d.carryToNext || 0) - d.accumulatedDeficit;

  const computeLedger = () => {
    const today = getLocalDayString();
    const nowStats = stats.getMonthStats(getLocalMonthString());
    const { values } = getAssetValues(nowStats.assetTotals, nowStats.assetQty);
    const baseCosts = initialStats.baseCosts || {};
    const isCash = (n: string) => assets.some(a => a.name === n && a.kind === 'cash');
    const known = (n?: string) => !!n && assets.some(a => a.name === n);

    const unitKeys: string[] = [];
    assets.forEach(a => { const u = unitOf(a.name); if (!unitKeys.includes(u)) unitKeys.push(u); });
    const unitValue: { [u: string]: number } = {};
    unitKeys.forEach(u => { unitValue[u] = 0; });
    assets.forEach(a => { unitValue[unitOf(a.name)] += values[a.name] || 0; });

    const pastTx = transactions.filter(t => t.date <= today);
    const earliest = pastTx.reduce((m, t) => (t.date < m ? t.date : m), today);
    const cost: { [u: string]: number } = {};
    const realized: { [u: string]: number } = {};
    const flows: { [u: string]: { date: string; amount: number }[] } = {};
    unitKeys.forEach(u => {
      const cashAsset = assets.find(a => a.name === u && a.kind === 'cash');
      const base = baseCosts[u];
      const c = base && base.cost ? base.cost : cashAsset ? (cashAsset.baseQuantity || 0) : 0;
      cost[u] = c; realized[u] = 0; flows[u] = [];
      if (c > 0) flows[u].push({ date: (base && base.date) || earliest, amount: -c });
    });

    const qty: { [a: string]: number } = {};
    assets.forEach(a => { qty[a.name] = a.baseQuantity || 0; });

    // 被移出的部位佔該標的的比例：優先用數量，其次用目前市值估算
    const fractionOf = (assetName: string, amount: number, q?: number) => {
      let frac: number;
      if (isCash(assetName)) frac = qty[assetName] > 0 ? amount / qty[assetName] : 1;
      else if (q && qty[assetName] > 0) frac = q / qty[assetName];
      else frac = (values[assetName] || 0) > 0 ? amount / values[assetName] : 1;
      return Math.min(1, Math.max(0, frac));
    };
    // 平均成本法：依比例扣除成本；合併單位內依目前市值分攤
    const takeCost = (assetName: string, frac: number) => {
      const u = unitOf(assetName);
      const members = assets.filter(a => unitOf(a.name) === u);
      const share = members.length <= 1 ? 1 : unitValue[u] > 0 ? (values[assetName] || 0) / unitValue[u] : 1 / members.length;
      const removed = cost[u] * share * frac;
      cost[u] -= removed;
      return removed;
    };

    let untagged = 0;
    [...pastTx].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).forEach(t => {
      if (t.type === 'expense' && t.category === '投資') {
        if (!known(t.asset)) { untagged++; return; }
        const u = unitOf(t.asset!);
        cost[u] += t.amount;
        flows[u].push({ date: t.date, amount: -t.amount });
        qty[t.asset!] = (qty[t.asset!] || 0) + (t.quantity || 0);
      } else if (t.type === 'income' && t.isAssetLiquidation && known(t.asset)) {
        const a = t.asset!;
        const removed = takeCost(a, fractionOf(a, t.amount, t.quantity));
        const u = unitOf(a);
        realized[u] += t.amount - removed;
        flows[u].push({ date: t.date, amount: t.amount });
        qty[a] = Math.max(0, (qty[a] || 0) - (t.quantity || (isCash(a) ? t.amount : 0)));
      } else if (t.type === 'transfer' && t.transferDirection === 'asset_swap' && known(t.asset) && known(t.fromAsset)) {
        const from = t.fromAsset!, to = t.asset!;
        const uFrom = unitOf(from), uTo = unitOf(to);
        const frac = fractionOf(from, t.amount, t.fromQuantity);
        if (uFrom !== uTo) {
          // 成本跟著轉過去：不會因為轉換就產生或洗掉損益
          const moved = takeCost(from, frac);
          cost[uTo] += moved;
          flows[uFrom].push({ date: t.date, amount: t.amount });
          flows[uTo].push({ date: t.date, amount: -t.amount });
        }
        qty[from] = Math.max(0, (qty[from] || 0) - (t.fromQuantity || (isCash(from) ? t.amount : 0)));
        qty[to] = (qty[to] || 0) + (t.quantity || (isCash(to) ? t.amount : 0));
      }
    });

    const rows = unitKeys.map(u => {
      const value = unitValue[u];
      const c = cost[u];
      const unitIsCash = assets.some(a => a.name === u && a.kind === 'cash');
      return {
        unit: u,
        isCash: unitIsCash,
        cost: c,
        value,
        unrealized: value - c,
        pct: c > 0 ? (value - c) / c : null,
        realized: realized[u],
        xirr: xirr([...flows[u], { date: today, amount: value }]),
        missingCost: !unitIsCash && value > 0 && !(baseCosts[u] && baseCosts[u].cost) && flows[u].length === 0,
      };
    }).filter(r => r.value > 0 || r.cost > 0 || r.realized !== 0);

    const allFlows = unitKeys.flatMap(u => flows[u]);
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    return {
      rows,
      totalValue,
      totalCost,
      totalUnrealized: totalValue - totalCost,
      totalRealized: rows.reduce((s, r) => s + r.realized, 0),
      portfolioXirr: xirr([...allFlows, { date: today, amount: totalValue }]),
      untagged,
      unitKeys,
    };
  };

  // 每次成功更新價格時，記錄一個淨資產點（同月份只保留最新一筆）
  const lastRecordedFetch = useRef(market.fetchedAt);
  useEffect(() => {
    if (!market.fetchedAt || market.fetchedAt === lastRecordedFetch.current) return;
    lastRecordedFetch.current = market.fetchedAt;
    const month = getLocalMonthString();
    const nowStats = stats.getMonthStats(month);
    const { values } = getAssetValues(nowStats.assetTotals, nowStats.assetQty);
    const invest = assets.reduce((s, a) => s + (values[a.name] || 0), 0);
    const cash = getAppCashTotal(nowStats);
    const debt = computeLiabilities().total;
    const point: NetWorthPoint = { month, date: getLocalDayString(), cash: Math.round(cash), invest: Math.round(invest), debt: Math.round(debt), total: Math.round(cash + invest - debt) };
    setNetWorth(prev => [...prev.filter(p => p.month !== month), point].sort((a, b) => a.month.localeCompare(b.month)));
  }, [market.fetchedAt]);

  const updateBaseCost = (unit: string, patch: Partial<{ cost: number; date: string }>) => {
    setInitialStats(prev => {
      const current = (prev.baseCosts || {})[unit] || { cost: 0, date: '' };
      return { ...prev, baseCosts: { ...(prev.baseCosts || {}), [unit]: { ...current, ...patch } } };
    });
  };

  const openAddMode = () => {
    setEditingId(null);
    setFormData({ 
      date: getLocalDayString(), 
      category: getDefaultCategory(),
      amount: '', note: '', tag: 'need', type: 'expense',
      isInstallment: false, installmentCount: '3', installmentCalcType: 'total', perMonthInput: '',
      investSource: 'monthly', fromSavings: false, fromEmergency: false, isAssetLiquidation: false, isReimbursement: false, isLoanDisbursement: false, isDebtRepayment: false, liability: '', asset: '', quantity: '', fromAsset: '', fromQuantity: '', transferDirection: 'to_savings'
    });
    setActiveTab('form');
  };

  const openEditMode = (trans: Transaction) => {
    if (swipedId === trans.id) return; 
    if (trans.type === 'adjust') { setDeleteModal({ show: true, id: trans.id }); return; } // 校正紀錄只能刪除
    setEditingId(trans.id);
    const source = trans.category === '投資' ? (trans.tag === 'invest_cumulative' ? 'cumulative' : 'monthly') : (trans.type === 'transfer' ? (trans.investSource || 'cumulative') : 'monthly');
    setFormData({ 
      date: trans.date, category: trans.category, amount: trans.amount.toString(), 
      note: trans.note.replace(/\(\d+\/\d+\)$/, '').trim(), tag: trans.tag as any, type: trans.type,
      isInstallment: false, installmentCount: '3', installmentCalcType: 'total', perMonthInput: '',
      investSource: source, fromSavings: trans.fromSavings || false, fromEmergency: trans.fromEmergency || false, isAssetLiquidation: trans.isAssetLiquidation || false,
      isReimbursement: trans.isReimbursement || false, asset: trans.asset || '',
      isLoanDisbursement: trans.isLoanDisbursement || false, isDebtRepayment: trans.isDebtRepayment || false, liability: trans.liability || '',
      quantity: trans.quantity ? String(trans.quantity) : '',
      fromAsset: trans.fromAsset || '',
      fromQuantity: trans.fromQuantity ? String(trans.fromQuantity) : '',
      transferDirection: trans.transferDirection || 'to_savings'
    });
    setActiveTab('form');
  };

  const jumpToHistoryCategory = (category: string) => {
      setFilterCategory(category);
      setActiveTab('history');
  };

  const handleFabClick = () => {
    if (activeTab === 'form' && !editingId) setActiveTab('dashboard');
    else openAddMode();
  };

  const handleAddCategory = () => {
      if (!newCategoryInput.trim()) return;
      if (expenseCategories.includes(newCategoryInput.trim())) return; 
      setExpenseCategories([...expenseCategories, newCategoryInput.trim()]);
      setNewCategoryInput('');
  };

  const handleRemoveCategory = (catToRemove: string) => {
      setExpenseCategories(expenseCategories.filter(c => c !== catToRemove));
      if (budgets[catToRemove]) {
          const newBudgets = { ...budgets };
          delete newBudgets[catToRemove];
          setBudgets(newBudgets);
      }
  };

  const handleAddAsset = () => {
      const name = newAssetName.trim();
      if (!name || assets.some(a => a.name === name)) return;
      setAssets([...assets, { name, kind: newAssetKind, baseline: 0 }]);
      setNewAssetName('');
  };

  const handleRemoveAsset = (name: string) => {
      setAssets(assets.filter(a => a.name !== name));
  };

  const updateAsset = (name: string, patch: Partial<Asset>) => {
      setAssets(assets.map(a => a.name === name ? { ...a, ...patch } : a));
  };

  const handleSave = () => {
    if (!formData.amount) return;
    let finalAmount = formData.amount;
    try {
       let cleanValue = formData.amount.replace(/[^0-9+\-*/.]/g, '');
       if (['+', '-', '*', '/'].includes(cleanValue.slice(-1))) cleanValue = cleanValue.slice(0, -1);
       // eslint-disable-next-line no-new-func
       const result = new Function('return ' + cleanValue)();
       finalAmount = String(Math.floor(Number(result)));
    } catch(e) {}

    let finalTag: any = formData.tag;
    let finalCategory = formData.category;
    let finalTransferDirection = formData.transferDirection;
    
    if (formData.type === 'transfer') {
        finalTag = 'transfer';
        finalCategory = '資金劃轉';
    } else if (formData.category === '收入') {
        finalTag = 'income';
    } else if (formData.category === '投資') {
        if (formData.fromSavings) {
             finalTag = 'invest_savings';
        } else {
             finalTag = formData.investSource === 'cumulative' ? 'invest_cumulative' : 'invest_monthly';
        }
    }

    const liabilityNames = (initialStats.liabilities || []).map(l => l.name);
    const finalLoan = formData.type === 'income' && !formData.isAssetLiquidation && !formData.isReimbursement && formData.isLoanDisbursement;
    const finalRepay = formData.type === 'expense' && finalCategory !== '投資' && formData.isDebtRepayment;
    const finalLiability = finalLoan || finalRepay ? (formData.liability || liabilityNames[0] || '學貸') : undefined;
    if (finalRepay) finalCategory = '償還負債';
    const isInvestExpense = formData.type === 'expense' && finalCategory === '投資';
    const isLiquidationIncome = formData.type === 'income' && formData.isAssetLiquidation;
    const isAssetSwap = formData.type === 'transfer' && formData.transferDirection === 'asset_swap';
    const finalAsset = (isInvestExpense || isLiquidationIncome || isAssetSwap) && formData.asset ? formData.asset : undefined;
    const isCashAsset = (name?: string) => !!name && assets.some(a => a.name === name && a.kind === 'cash');
    const finalReimbursement = formData.type === 'income' && !formData.isAssetLiquidation && formData.isReimbursement;
    const parsedQty = Number(formData.quantity);
    // 投資現金的數量就是台幣金額，自動帶入
    const finalQuantity = finalAsset && isCashAsset(finalAsset) ? Number(finalAmount)
        : finalAsset && isFinite(parsedQty) && parsedQty > 0 ? parsedQty : undefined;
    const finalFromAsset = isAssetSwap && formData.fromAsset ? formData.fromAsset : undefined;
    const parsedFromQty = Number(formData.fromQuantity);
    const finalFromQuantity = !finalFromAsset ? undefined
        : isCashAsset(finalFromAsset) ? Number(finalAmount)
        : isFinite(parsedFromQty) && parsedFromQty > 0 ? parsedFromQty : undefined;
    const finalInvestSource = (formData.type === 'transfer' && (finalTransferDirection === 'to_savings' || finalTransferDirection === 'invest_to_emergency')) || isInvestExpense ? formData.investSource : undefined;

    if (editingId) {
      const originalTrans = transactions.find(t => t.id === editingId);
      if (originalTrans && originalTrans.groupId) {
          const updatedTransactions = transactions.map(t => {
              if (t.groupId === originalTrans.groupId) {
                  let newDate = t.date;
                
                  if (t.date !== formData.date && t.id === editingId) {
                        newDate = formData.date;
                  } else if (t.date !== formData.date) { 
                      const oldEditDateObj = new Date(originalTrans.date);
                      const newEditDateObj = new Date(formData.date);
                      const timeDiff = newEditDateObj.getTime() - oldEditDateObj.getTime();
                      const currentTDateObj = new Date(t.date);
                      newDate = formatDateToLocal(new Date(currentTDateObj.getTime() + timeDiff));
                  }

                  const shared = {
                      date: newDate, category: finalCategory, tag: finalTag, type: formData.type,
                      transferDirection: formData.type === 'transfer' ? finalTransferDirection : undefined,
                      fromSavings: formData.fromSavings, fromEmergency: formData.fromEmergency, isAssetLiquidation: formData.isAssetLiquidation,
                      isReimbursement: finalReimbursement, asset: finalAsset, quantity: finalQuantity, investSource: finalInvestSource,
                      fromAsset: finalFromAsset, fromQuantity: finalFromQuantity,
                      isLoanDisbursement: finalLoan, isDebtRepayment: finalRepay, liability: finalLiability,
                  };

                  if (t.id === editingId) {
                      return { ...t, ...shared, amount: Number(finalAmount), note: formData.note };
                  }
                  return { ...t, ...shared };
              }
              return t;
          });
          setTransactions(updatedTransactions);
      } else {
          setTransactions(transactions.map(t => t.id === editingId ? {
              ...t, ...formData, type: formData.type,
              transferDirection: formData.type === 'transfer' ? finalTransferDirection : undefined,
              category: finalCategory, tag: finalTag, amount: Number(finalAmount),
              fromSavings: formData.fromSavings, fromEmergency: formData.fromEmergency, isAssetLiquidation: formData.isAssetLiquidation,
              isReimbursement: finalReimbursement, asset: finalAsset, quantity: finalQuantity, investSource: finalInvestSource,
              fromAsset: finalFromAsset, fromQuantity: finalFromQuantity,
              isLoanDisbursement: finalLoan, isDebtRepayment: finalRepay, liability: finalLiability
          } : t));
      }
      setActiveTab('history');
      return;
    } 
    
    const baseId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
    const totalAmount = Number(finalAmount);
    const shouldInstallment = formData.type === 'expense' && !formData.fromSavings && !formData.fromEmergency && !formData.isAssetLiquidation && formData.isInstallment && formData.category !== '投資' && Number(formData.installmentCount) > 1;

    if (shouldInstallment) {
       const newTransactions: Transaction[] = [];
       const count = Math.round(Number(formData.installmentCount));
       const perMonthAmount = Math.floor(totalAmount / count);
       const remainder = totalAmount - (perMonthAmount * count);
       const [y, m, d] = formData.date.split('-').map(Number);
       const startDay = d;
       const groupId = `group_${baseId}_${Date.now()}`; 
          
       for (let i = 0; i < count; i++) {
          const currentAmount = i === 0 ? perMonthAmount + remainder : perMonthAmount; 
          const nextDate = new Date(y, m - 1 + i, d);
          if (nextDate.getDate() !== startDay) nextDate.setDate(0); 
          
          newTransactions.push({
            id: baseId + i, ...formData, type: formData.type, category: finalCategory, date: formatDateToLocal(nextDate), amount: currentAmount,
            note: `${formData.note} (${i + 1}/${count})`, groupId: groupId, tag: finalTag, fromSavings: false, fromEmergency: false, isAssetLiquidation: false,
            isReimbursement: false, asset: undefined, quantity: undefined, investSource: undefined,
            fromAsset: undefined, fromQuantity: undefined,
            isLoanDisbursement: false, isDebtRepayment: false, liability: undefined,
          });
       }
       setTransactions([...newTransactions, ...transactions]);
    } else {
       const item: Transaction = { 
           id: baseId, ...formData, type: formData.type, category: finalCategory, tag: finalTag, amount: totalAmount, 
           transferDirection: formData.type === 'transfer' ? finalTransferDirection : undefined,
           isReimbursement: finalReimbursement, asset: finalAsset, quantity: finalQuantity, investSource: finalInvestSource,
           fromAsset: finalFromAsset, fromQuantity: finalFromQuantity,
           isLoanDisbursement: finalLoan, isDebtRepayment: finalRepay, liability: finalLiability
       };
       setTransactions([item, ...transactions]);
    }
    setActiveTab('history');
  };

  const requestDelete = (e: any, id: number) => { e.stopPropagation(); setDeleteModal({ show: true, id }); setSwipedId(null); };
  const confirmDelete = () => {
    if (deleteModal.id) {
      setTransactions(transactions.filter(t => t.id !== deleteModal.id));
      if (activeTab === 'form' && editingId === deleteModal.id) setActiveTab('history');
    }
    setDeleteModal({ show: false, id: null });
  };
  const updateBudget = (category: string, value: string) => { setBudgets(prev => ({ ...prev, [category]: Number(value) })); };

  const renderDashboardView = () => {
    const { emergencyFund, emergencyGoal, installmentExpense, income, avgNeed, needSampleMonths, advance, advanceOutstanding, need, want } = stats.dashboard;
    const emergencyProgress = emergencyGoal > 0 ? Math.min((emergencyFund / emergencyGoal) * 100, 100) : 0;
    const isEmergencyFull = emergencyGoal > 0 && emergencyFund >= emergencyGoal;
    const installmentRatio = income > 0 ? (installmentExpense / income) * 100 : 0;
    const isAutoEmergency = initialStats.emergencyMode === 'auto';
    const needWantTotal = need + want; // 代墊不算真正的消費，不放進比例

    const cardTitleStyle = "text-base font-bold text-black mb-1"; 
    const cardSubLabelStyle = "text-xs text-gray-500";
    const cardContainerStyle = "px-5 py-3.5"; 
    const mainMetricStyle = "text-2xl font-bold tracking-tight";
    const splitMetricStyle = "text-2xl font-bold tracking-tight";

    return (
      <div className="space-y-4 pb-4 pt-2">
        <div className="flex justify-start items-center px-1">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white text-black font-bold text-base rounded-full px-4 py-2 outline-none appearance-none pr-8"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}>
              {availableMonths.map(m => ( <option key={m} value={m}>{m}</option> ))}
            </select>
        </div>

        <CardContainer className="p-5">
           <div className="flex justify-between items-start mb-3">
              <div>
                 <p className="text-sm text-gray-500 mb-1">緊急預備金</p>
                 <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight tabular-nums text-black">${formatMoney(Math.floor(emergencyFund))}</span>
                    {emergencyGoal > 0
                        ? <span className="text-sm text-gray-400 tabular-nums">/ ${formatMoney(emergencyGoal)}</span>
                        : <button onClick={() => { setSettingsPage('emergency'); setActiveTab('settings'); }} className="text-sm font-bold" style={{ color: THEME.accentGold }}>設定目標</button>}
                 </div>
              </div>
              {emergencyGoal > 0 && (isEmergencyFull
                  ? <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full"><CheckCircle className="w-3.5 h-3.5" />已達標</span>
                  : <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">補足中</span>)}
           </div>
           <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${emergencyProgress}%`, backgroundColor: isEmergencyFull ? THEME.success : THEME.accentGold }}></div>
           </div>
           <p className="text-xs text-gray-500">
              {isEmergencyFull ? '已達標，可以投資' : '未達標前暫停投資'}
              {isAutoEmergency && (needSampleMonths > 0
                  ? `・目標依近 ${needSampleMonths} 個月需要支出 × ${initialStats.emergencyMonths || 6}`
                  : '・支出紀錄不足，暫用最低目標')}
           </p>
        </CardContainer>

        <CardContainer className={`${cardContainerStyle} flex justify-between items-center relative overflow-hidden`}>
           <div className="relative z-10">
            <h3 className={cardTitleStyle}>本月淨收支</h3>
            <p className={`${mainMetricStyle} ${stats.dashboard.netIncome >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
              {stats.dashboard.netIncome >= 0 ? '+' : ''}{formatMoney(stats.dashboard.netIncome)}
            </p>
          </div>
          <div className="text-right space-y-1 relative z-10">
             <div className="flex items-center gap-2 justify-end">
                <span className={cardSubLabelStyle}>收入</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: THEME.success }}>+${formatMoney(stats.dashboard.income)}</span>
             </div>
             <div className="flex items-center gap-2 justify-end">
                <span className={cardSubLabelStyle}>支出</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: THEME.danger }}>-${formatMoney(stats.dashboard.expense)}</span>
             </div>
          </div>
        </CardContainer>

        <CardContainer className={cardContainerStyle}>
           <div className="flex items-center justify-between mb-3">
              <h3 className={cardTitleStyle}>分期付款負擔</h3>
              <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">佔月收入 {installmentRatio.toFixed(1)}%</span>
           </div>
           <div className="flex items-baseline gap-1 mb-2">
              <span className={`${mainMetricStyle} text-black`}>${formatMoney(installmentExpense)}</span>
              <span className="text-xs text-gray-400 font-medium">/ 月</span>
           </div>
           <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000 bg-black" style={{ width: `${Math.min(installmentRatio, 100)}%` }}></div>
           </div>
        </CardContainer>

        <CardContainer className={cardContainerStyle}>
           <div className="flex items-center justify-between mb-4">
              <h3 className={cardTitleStyle}>消費性質分析</h3>
           </div>
           
           <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100 mb-4">
             <div className="h-full bg-black transition-all duration-1000 ease-out" style={{ width: `${needWantTotal > 0 ? (need / needWantTotal * 100) : 0}%` }}></div>
             <div className="h-full bg-gray-400 transition-all duration-1000 ease-out" style={{ width: `${needWantTotal > 0 ? (want / needWantTotal * 100) : 0}%` }}></div>
           </div>

           <div className="flex justify-between items-end gap-2">
              <button 
                type="button"
                className="flex flex-col gap-0.5 cursor-pointer active:opacity-70 transition-opacity flex-1 text-left"
                onClick={() => { setFilterTag('need'); setActiveTab('history'); }}
              >
                 <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                    <span className={cardSubLabelStyle}>Need</span>
                 </div>
                 <div className="flex items-baseline gap-1.5">
                    <span className={`${splitMetricStyle} text-gray-900`}>${formatMoney(need)}</span>
                    <span className="text-xs font-medium text-gray-400">
                        {needWantTotal > 0 ? ((need / needWantTotal) * 100).toFixed(0) : 0}%
                    </span>
                 </div>
              </button>

              <button 
                type="button"
                className="flex flex-col gap-0.5 items-end cursor-pointer active:opacity-70 transition-opacity flex-1 text-right"
                onClick={() => { setFilterTag('want'); setActiveTab('history'); }}
              >
                 <div className="flex items-center gap-1.5">
                    <span className={cardSubLabelStyle}>Want</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                 </div>
                 <div className="flex items-baseline gap-1.5 justify-end">
                    <span className={`${splitMetricStyle} text-gray-800`}>${formatMoney(want)}</span>
                    <span className="text-xs font-medium text-gray-400">
                        {needWantTotal > 0 ? ((want / needWantTotal) * 100).toFixed(0) : 0}%
                    </span>
                 </div>
              </button>
           </div>

           <button
             type="button"
             onClick={() => { setFilterTag('advance'); setActiveTab('history'); }}
             className="mt-4 pt-3 border-t border-gray-100 w-full flex justify-between items-center active:opacity-70 transition-opacity"
           >
              <div className="flex items-center gap-1.5">
                 <Tag className="w-3.5 h-3.5" style={{ color: THEME.advance }} />
                 <span className="text-xs font-bold text-gray-600">代墊未收回</span>
              </div>
              <div className="flex items-baseline gap-2">
                 {advance > 0 && <span className="text-xs text-gray-400">本月代墊 ${formatMoney(advance)}</span>}
                 <span className="text-base font-bold tabular-nums" style={{ color: advanceOutstanding > 0 ? THEME.advance : '#9CA3AF' }}>${formatMoney(advanceOutstanding)}</span>
              </div>
           </button>
        </CardContainer>

        <CardContainer className={cardContainerStyle}>
          <div className="flex justify-between items-center mb-4">
              <h3 className={cardTitleStyle}>預算執行狀況</h3>
              <button onClick={() => { setSettingsPage('categories'); setActiveTab('settings'); }} className="text-sm font-bold" style={{ color: THEME.accentGold }}>編輯</button>
          </div>
          <div className="space-y-4">
            {Object.entries(budgets).filter(([_, budget]) => (budget as number) > 0).map(([cat, budget]) => {
                const currentMonthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth));
                const spent = currentMonthTransactions.filter(t => t.category === cat && !t.fromSavings && !t.fromEmergency).reduce((sum, t) => sum + Number(t.amount), 0);
                const percent = Math.min((spent / (budget as number)) * 100, 100);
                const isOver = spent > (budget as number);
                return (
                <div key={cat} className="group">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="font-bold text-gray-700 text-xs">{cat}</span>
                        <span className="text-gray-500 font-medium text-xs">
                            <span className={isOver ? 'text-red-500 font-bold' : 'text-black'}>${formatMoney(spent)}</span> <span className="text-gray-300 mx-1">/</span> ${formatMoney(budget as number)}
                        </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-red-500' : 'bg-black'}`} style={{ width: `${percent}%` }}></div>
                    </div>
                </div>
                );
            })}
            {Object.values(budgets).every(b => b === 0) && <p className="text-xs text-gray-400 text-center py-1">未設定</p>}
          </div>
        </CardContainer>

        <CardContainer className="px-5 py-4">
          <div className="mb-2"><h3 className={cardTitleStyle}>支出分類佔比</h3></div>
          {stats.dashboard.pieData.length > 0 ? (
            <>
                <div className="h-64 -mx-4 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                        <Pie onClick={(data) => jumpToHistoryCategory(data.name)} data={stats.dashboard.pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none" cursor="pointer">
                        {stats.dashboard.pieData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} /> ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    </RePieChart>
                    </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                    {stats.dashboard.pieData.map((entry, index) => (
                    <div key={entry.name} onClick={() => jumpToHistoryCategory(entry.name)} className="flex items-center justify-between py-1 cursor-pointer active:bg-gray-50 rounded-lg px-1 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                            <span className="text-xs font-semibold text-gray-600">{entry.name}</span>
                        </div>
                        <div className="text-right flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 tabular-nums">${formatMoney(entry.value)}</span>
                            <span className="text-xs text-gray-400 font-medium w-8 text-right tabular-nums">{stats.dashboard.expense > 0 ? ((entry.value / stats.dashboard.expense) * 100).toFixed(0) : 0}%</span>
                        </div>
                    </div>
                    ))}
                </div>
            </>
          ) : <div className="h-32 flex items-center justify-center text-gray-400 text-xs">尚無紀錄</div>}
        </CardContainer>
      </div>
    );
  }
  
  const isCashName = (name: string) => assets.some(a => a.name === name && a.kind === 'cash');

  const renderAssetChips = (onPick: (name: string) => void, selectedName: string = formData.asset) => (
    <div className="flex flex-wrap gap-2">
      {assets.map(a => {
        const selected = selectedName === a.name;
        return (
          <button key={a.name} type="button" onClick={() => onPick(selected ? '' : a.name)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border transition ${selected ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'}`}>
            {a.name}
            <span className={`ml-1 text-xs font-medium ${selected ? 'text-white/60' : 'text-gray-300'}`}>{a.kind === 'crypto' ? '幣' : a.kind === 'equity' ? '股' : a.kind === 'cash' ? '現' : ''}</span>
          </button>
        );
      })}
      {assets.length === 0 && <span className="text-xs text-gray-400">尚未設定標的，可到設定新增</span>}
    </div>
  );

  const renderQuantityInput = (label: string) => (
    <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
      <span className="text-xs font-bold text-gray-500">{label}（選填）</span>
      <input type="text" inputMode="decimal" placeholder="0" value={formData.quantity}
        onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFormData({ ...formData, quantity: e.target.value }); }}
        className="text-right text-sm font-bold text-black bg-transparent outline-none w-32" />
    </div>
  );

  // ---- 負債 ----
  const computeLiabilities = () => {
    const today = getLocalDayString();
    const list = initialStats.liabilities || [];
    const rows = list.map(l => {
      const disbursed = transactions.filter(t => t.date <= today && t.isLoanDisbursement && (t.liability || list[0]?.name) === l.name).reduce((s, t) => s + t.amount, 0);
      const repaid = transactions.filter(t => t.date <= today && t.isDebtRepayment && (t.liability || list[0]?.name) === l.name).reduce((s, t) => s + t.amount, 0);
      return { name: l.name, base: l.baseBalance || 0, disbursed, repaid, balance: Math.max(0, (l.baseBalance || 0) + disbursed - repaid) };
    });

    // 分期付款：尚未到期的各期金額，就是還欠的錢（到期那天已記成支出，負債自然減少）
    const groups: { [g: string]: { name: string; remaining: number; remainingCount: number; totalCount: number; perMonth: number; lastDate: string } } = {};
    transactions.filter(t => t.groupId && t.type === 'expense').forEach(t => {
      const g = t.groupId!;
      if (!groups[g]) groups[g] = { name: (t.note || '').replace(/\s*\(\d+\/\d+\)$/, '').trim() || t.category, remaining: 0, remainingCount: 0, totalCount: 0, perMonth: t.amount, lastDate: t.date };
      const item = groups[g];
      item.totalCount += 1;
      if (t.date > item.lastDate) item.lastDate = t.date;
      if (t.date > today) { item.remaining += t.amount; item.remainingCount += 1; item.perMonth = t.amount; }
    });
    const installments = Object.values(groups).filter(x => x.remaining > 0).sort((a, b) => b.remaining - a.remaining);
    const installmentTotal = installments.reduce((s, x) => s + x.remaining, 0);

    const debtTotal = rows.reduce((s, r) => s + r.balance, 0);
    return { rows, installments, installmentTotal, debtTotal, total: debtTotal + installmentTotal };
  };

  const renderLiabilityChips = () => {
    const list = initialStats.liabilities || [];
    if (list.length <= 1) return null;
    const selected = formData.liability || list[0].name;
    return (
      <div className="flex flex-wrap gap-2 px-1">
        {list.map(l => (
          <button key={l.name} type="button" onClick={() => setFormData({ ...formData, liability: l.name })}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border transition ${selected === l.name ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'}`}>{l.name}</button>
        ))}
      </div>
    );
  };

  const renderFormView = () => {
    // 修正：額度依「交易日期」所在月份計算，而不是畫面上選擇的月份
    const formMonth = formData.date.substring(0, 7);
    const formStats = stats.getMonthStats(formMonth);
    const { monthlyRemainingInvestable, cumulativeAddOnAvailable, savings, emergencyFund, emergencyGoal, assetTotals, assetQty } = formStats;
    
    let effectiveMonthlyLimit = monthlyRemainingInvestable;
    let effectiveCumulativeLimit = cumulativeAddOnAvailable;
    let effectiveSavingsLimit = savings;
    let effectiveEmergencyLimit = emergencyFund;

    const originalTrans = editingId ? transactions.find(t => t.id === editingId) : undefined;
    if (originalTrans) {
        const amt = originalTrans.amount;
        const origMonth = originalTrans.date.substring(0, 7);
        const isSameMonth = origMonth === formMonth;      // 當月額度只在同月份才加回
        const isNotLater = origMonth <= formMonth;        // 累積型的池子只要原交易不晚於目前月份就加回
        if (originalTrans.type === 'expense') {
            if (originalTrans.category === '投資' && !originalTrans.fromSavings && !originalTrans.fromEmergency) {
                if (originalTrans.investSource === 'monthly' && isSameMonth) effectiveMonthlyLimit += amt;
                else if (originalTrans.investSource === 'cumulative' && isNotLater) effectiveCumulativeLimit += amt;
            }
            if (originalTrans.fromSavings && isNotLater) effectiveSavingsLimit += amt;
            if (originalTrans.fromEmergency && isNotLater) effectiveEmergencyLimit += amt;
        } else if (originalTrans.type === 'transfer') {
            if (originalTrans.transferDirection === 'to_savings' || originalTrans.transferDirection === 'invest_to_emergency') {
                if (originalTrans.investSource === 'monthly' && isSameMonth) effectiveMonthlyLimit += amt;
                else if (originalTrans.investSource === 'cumulative' && isNotLater) effectiveCumulativeLimit += amt;
            } else if ((originalTrans.transferDirection === 'to_investable' || originalTrans.transferDirection === 'savings_to_emergency') && isNotLater) {
                effectiveSavingsLimit += amt;
            }
        }
    }

    const currentSavings = effectiveSavingsLimit;
    const currentEmergency = effectiveEmergencyLimit;
    const savingsFloor = initialStats.savingsFloor || 0; 
    
    const isSavingsInsufficient = formData.fromSavings && (Number(formData.amount) > currentSavings);
    const isEmergencyInsufficient = formData.fromEmergency && (Number(formData.amount) > currentEmergency);
    
    const isInvestForm = formData.type === 'expense' && formData.category === '投資';
    let isInvestmentInsufficient = false;
    if (isInvestForm) {
        const amount = Number(formData.amount);
        if (!formData.fromSavings) {
            if (formData.investSource === 'monthly' && amount > effectiveMonthlyLimit) isInvestmentInsufficient = true;
            else if (formData.investSource === 'cumulative' && amount > effectiveCumulativeLimit) isInvestmentInsufficient = true;
        }
    }

    // 加密貨幣比例：以「起始金額 + 之後投入 - 變現」估算（不是即時市值）
    const cryptoCap = initialStats.cryptoCap || 0;
    const projectedTotals: { [key: string]: number } = { ...getAssetValues(assetTotals, assetQty).values };
    if (originalTrans && originalTrans.category === '投資' && originalTrans.asset && originalTrans.date.substring(0, 7) <= formMonth) {
        projectedTotals[originalTrans.asset] = Math.max(0, (projectedTotals[originalTrans.asset] || 0) - originalTrans.amount);
    }
    const baseCryptoShare = calcCryptoShare(projectedTotals, assets);
    if (isInvestForm && formData.asset) {
        projectedTotals[formData.asset] = (projectedTotals[formData.asset] || 0) + (Number(formData.amount) || 0);
    }
    const projectedCryptoShare = calcCryptoShare(projectedTotals, assets);
    const selectedAssetKind = assets.find(a => a.name === formData.asset)?.kind;
    const isCryptoCapExceeded = isInvestForm && selectedAssetKind === 'crypto' && cryptoCap > 0 && projectedCryptoShare > cryptoCap;

    let isTransferInsufficient = false;
    let isTransferMonthlyInsufficient = false;
    let isTransferCumulativeInsufficient = false;
    let isSavingsFloorBreached = false; 
    
    if (formData.type === 'transfer') {
        const amount = Number(formData.amount);
        if (formData.transferDirection === 'to_savings' || formData.transferDirection === 'invest_to_emergency') {
            if (formData.investSource === 'monthly' && amount > effectiveMonthlyLimit) isTransferMonthlyInsufficient = true;
            else if (formData.investSource === 'cumulative' && amount > effectiveCumulativeLimit) isTransferCumulativeInsufficient = true;
        }
        if (formData.transferDirection === 'to_investable' || formData.transferDirection === 'savings_to_emergency') {
            if (amount > currentSavings) isTransferInsufficient = true;
        }
        if (formData.transferDirection === 'to_investable' && !isTransferInsufficient) {
             if (currentSavings - amount < savingsFloor) isSavingsFloorBreached = true; 
        }
    }

    const isEmergencyNotFull = emergencyGoal > 0 && currentEmergency < emergencyGoal;
    const isInvestmentBlockedByEmergency = isInvestForm && isEmergencyNotFull;

    const isSwap = formData.type === 'transfer' && formData.transferDirection === 'asset_swap';
    const isSwapInvalid = isSwap && (!formData.asset || !formData.fromAsset || formData.asset === formData.fromAsset);
    const isSubmitDisabled = isSwapInvalid || isSavingsInsufficient || isEmergencyInsufficient || isInvestmentInsufficient || isTransferInsufficient || isTransferMonthlyInsufficient || isTransferCumulativeInsufficient || isSavingsFloorBreached || isInvestmentBlockedByEmergency;

    return (
        <div className="space-y-5 pb-20 pt-2">
        <div className="flex items-center justify-between px-1 mb-2">
            <button onClick={() => setActiveTab('dashboard')} className="flex items-center text-gray-500 font-medium -ml-2 p-2 hover:bg-gray-100 rounded-lg transition"><ChevronLeft className="w-5 h-5" /> 返回</button>
            <div className="w-10"></div>
        </div>
        <div className="bg-gray-200 p-0.5 rounded-lg flex mb-4">
            <button onClick={() => setFormData({...formData, type: 'expense', category: '飲食', tag: 'need', investSource: 'monthly', isAssetLiquidation: false, isReimbursement: false, isLoanDisbursement: false, asset: ''})} className={`flex-1 py-1.5 text-sm font-bold rounded-md transition ${formData.type === 'expense' ? 'bg-white text-black shadow-sm' : 'text-gray-600'}`}>支出</button>
            <button onClick={() => setFormData({...formData, type: 'income', category: '收入', tag: 'income', investSource: 'monthly', fromSavings: false, fromEmergency: false, isReimbursement: false, isDebtRepayment: false, asset: ''})} className={`flex-1 py-1.5 text-sm font-bold rounded-md transition ${formData.type === 'income' ? 'bg-white text-black shadow-sm' : 'text-gray-600'}`}>收入</button>
            <button onClick={() => setFormData({...formData, type: 'transfer', category: '資金劃轉', tag: 'transfer', transferDirection: 'to_savings', fromSavings: false, fromEmergency: false, isAssetLiquidation: false, isLoanDisbursement: false, isDebtRepayment: false, isReimbursement: false, asset: ''})} className={`flex-1 py-1.5 text-sm font-bold rounded-md transition ${formData.type === 'transfer' ? 'bg-white text-black shadow-sm' : 'text-gray-600'}`}>劃轉</button>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden ">
            <div className="flex items-center justify-between p-5 border-b border-gray-50">
                <label className="text-base font-bold text-black">金額</label>
                <div className="flex-1 ml-4 relative">
                    <input ref={amountInputRef} type="text" placeholder="0" value={formData.amount} readOnly onClick={() => openCalculator()}
                    className={`w-full text-right text-3xl font-bold placeholder-gray-200 bg-transparent outline-none overflow-x-auto whitespace-nowrap ${formData.installmentCalcType === 'monthly' && formData.isInstallment ? 'text-gray-300 cursor-not-allowed' : 'cursor-pointer text-black'}`}/>
                </div>
            </div>
            <div className="flex items-center justify-between p-5 border-b border-gray-50 relative">
                <label className="text-base font-bold text-black">日期</label>
                <div className="flex-1 ml-4 text-right">
                    <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="text-base font-medium text-gray-600 bg-transparent outline-none text-right appearance-none absolute inset-0 opacity-0 z-10 w-full h-full cursor-pointer" />
                    <span className="text-base font-medium text-gray-600 bg-transparent outline-none text-right pointer-events-none relative z-0">{formData.date.split('-').join('/')}</span>
                </div>
            </div>
            <div className="flex items-center justify-between p-5">
                <label className="text-base font-bold text-black">分類</label>
                <div className="flex items-center gap-2 relative">
                    {formData.type === 'transfer' ? (
                        <span className="text-base font-medium text-gray-600">資金劃轉</span>
                    ) : (
                        <select value={formData.category} onChange={e => {
                                const newCategory = e.target.value;
                                let newTag = formData.tag;
                                if (newCategory === '代墊') newTag = 'advance';
                                else if (formData.category === '代墊' && formData.tag === 'advance') newTag = 'need';
                                setFormData({...formData, category: newCategory, tag: newTag, asset: newCategory === '投資' ? formData.asset : ''});
                            }} 
                            className="text-base font-medium text-gray-600 bg-transparent outline-none text-right appearance-none pr-6 relative z-10"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right center', backgroundRepeat: 'no-repeat', backgroundSize: '1em 1em' }}>
                            {formData.type === 'income' ? <option value="收入">收入</option> : <>{expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}<option value="投資">投資</option></>}
                        </select>
                    )}
                </div>
            </div>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden ">
            {formData.type === 'transfer' ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setFormData({...formData, transferDirection: 'to_savings'})} className={`py-3 rounded-xl text-sm font-bold transition border ${formData.transferDirection === 'to_savings' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200'}`}>投資 ➔ 存款</button>
                        <button onClick={() => setFormData({...formData, transferDirection: 'to_investable'})} className={`py-3 rounded-xl text-sm font-bold transition border ${formData.transferDirection === 'to_investable' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200'}`}>存款 ➔ 投資</button>
                        <button onClick={() => setFormData({...formData, transferDirection: 'invest_to_emergency'})} className={`py-3 rounded-xl text-sm font-bold transition border ${formData.transferDirection === 'invest_to_emergency' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200'}`}>投資 ➔ 預備金</button>
                        <button onClick={() => setFormData({...formData, transferDirection: 'savings_to_emergency'})} className={`py-3 rounded-xl text-sm font-bold transition border ${formData.transferDirection === 'savings_to_emergency' ? 'bg-black text-white border-black' : 'bg-white text-gray-400 border-gray-200'}`}>存款 ➔ 預備金</button>
                        <button onClick={() => setFormData({...formData, transferDirection: 'asset_swap', fromAsset: formData.fromAsset || (assets.find(a => a.kind === 'cash')?.name || '')})} className={`col-span-2 py-3 rounded-xl text-sm font-bold transition border ${formData.transferDirection === 'asset_swap' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-200'}`}>資產轉換（例如現金 ➔ BTC）</button>
                    </div>

                    {formData.transferDirection === 'asset_swap' && (
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500">金額填這次轉換的台幣價值。只改變標的之間的配置，不會動到任何預算或額度。</p>
                            <div>
                                <p className="text-xs font-bold text-gray-400 mb-2">從</p>
                                {renderAssetChips(name => setFormData({...formData, fromAsset: name}), formData.fromAsset)}
                                {formData.fromAsset && !isCashName(formData.fromAsset) && (
                                    <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                                        <span className="text-xs font-bold text-gray-500">轉出的數量（選填）</span>
                                        <input type="text" inputMode="decimal" placeholder="0" value={formData.fromQuantity}
                                            onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setFormData({ ...formData, fromQuantity: e.target.value }); }}
                                            className="text-right text-sm font-bold text-black bg-transparent outline-none w-32" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-400 mb-2">到</p>
                                {renderAssetChips(name => setFormData({...formData, asset: name}))}
                                {formData.asset && !isCashName(formData.asset) && renderQuantityInput('買到的數量')}
                            </div>
                            {isSwapInvalid && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">請選擇兩個不同的標的</span></div>}
                        </div>
                    )}

                    {(formData.transferDirection === 'to_savings' || formData.transferDirection === 'invest_to_emergency') && (
                        <div className="space-y-3 mt-2">
                            <p className="text-xs font-bold text-gray-400 mb-2">資金來源</p>
                            <div onClick={() => setFormData({...formData, investSource: 'monthly'})} className={`flex items-center justify-between cursor-pointer p-2 rounded-lg transition-colors ${formData.investSource === 'monthly' ? 'bg-gray-100' : ''}`}>
                                <div className="flex flex-col"><span className="text-base font-medium text-gray-900">當月額度</span><span className={`text-xs font-bold mt-0.5 ${effectiveMonthlyLimit < Number(formData.amount) ? 'text-red-400' : 'text-gray-500'}`}>餘額: ${formatMoney(effectiveMonthlyLimit)}</span></div>
                                <div className="relative flex items-center"><input type="radio" checked={formData.investSource === 'monthly'} onChange={() => {}} className="w-5 h-5 text-black accent-black" /></div>
                            </div>
                            <div className="h-px bg-gray-50 w-full ml-2"></div>
                            <div onClick={() => setFormData({...formData, investSource: 'cumulative'})} className={`flex items-center justify-between cursor-pointer p-2 rounded-lg transition-colors ${formData.investSource === 'cumulative' ? 'bg-gray-100' : ''}`}>
                                <div className="flex flex-col"><span className="text-base font-medium text-gray-900">歷史資金</span><span className={`text-xs font-bold mt-0.5 ${effectiveCumulativeLimit < Number(formData.amount) ? 'text-red-400' : 'text-gray-800'}`}>餘額: ${formatMoney(effectiveCumulativeLimit)}</span></div>
                                <div className="relative flex items-center"><input type="radio" checked={formData.investSource === 'cumulative'} onChange={() => {}} className="w-5 h-5 text-black accent-black" /></div>
                            </div>
                        </div>
                    )}

                    {formData.transferDirection === 'to_investable' && savingsFloor > 0 && (
                        <p className="text-xs text-gray-500 px-2 -mt-2">保留底線 $ {formatMoney(savingsFloor)} | 可用 $ {formatMoney(Math.max(0, currentSavings - savingsFloor))}</p>
                    )}
                    {isTransferMonthlyInsufficient && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}
                    {isTransferCumulativeInsufficient && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}
                    {isTransferInsufficient && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}
                    {formData.transferDirection === 'to_investable' && isSavingsFloorBreached && !isTransferInsufficient && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">觸及保留底線，操作鎖定</span></div>}
                </div>
            ) : isInvestForm ? (
                <div className="p-5">
                    <p className="text-xs font-bold text-gray-400 mb-4">資金來源</p>
                    <div className="space-y-4">
                        <div onClick={() => setFormData({...formData, investSource: 'monthly', fromSavings: false})} className={`flex items-center justify-between cursor-pointer group p-2 rounded-lg transition-colors ${!formData.fromSavings && formData.investSource === 'monthly' ? 'bg-gray-100' : ''}`}>
                            <div className="flex flex-col"><span className="text-base font-medium text-gray-900">當月額度</span><span className={`text-xs font-bold mt-0.5 ${effectiveMonthlyLimit < 0 ? 'text-red-400' : 'text-gray-500'}`}>餘額: ${formatMoney(effectiveMonthlyLimit)}</span></div>
                            <div className="relative flex items-center"><input type="radio" name="investSource" checked={!formData.fromSavings && formData.investSource === 'monthly'} onChange={() => {}} className="w-5 h-5 text-black accent-black" /></div>
                        </div>
                        
                        <div className="h-px bg-gray-50 w-full ml-4"></div>
                        
                        <div onClick={() => setFormData({...formData, investSource: 'cumulative', fromSavings: false})} className={`flex items-center justify-between cursor-pointer group p-2 rounded-lg transition-colors ${!formData.fromSavings && formData.investSource === 'cumulative' ? 'bg-gray-100' : ''}`}>
                             <div className="flex flex-col"><span className="text-base font-medium text-black">歷史資金</span><span className={`text-xs font-bold mt-0.5 ${effectiveCumulativeLimit < 0 ? 'text-red-400' : 'text-gray-800'}`}>餘額: ${formatMoney(effectiveCumulativeLimit)}</span></div>
                            <input type="radio" name="investSource" checked={!formData.fromSavings && formData.investSource === 'cumulative'} onChange={() => {}} className="w-5 h-5 text-black accent-black" />
                        </div>

                        <div className="h-px bg-gray-50 w-full ml-4"></div>

                        <div onClick={() => setFormData({...formData, fromSavings: true})} className={`flex items-center justify-between cursor-pointer group p-2 rounded-lg transition-colors ${formData.fromSavings ? 'bg-gray-100' : ''}`}>
                             <div className="flex flex-col">
                                <div className="flex items-center gap-1.5"><span className="text-base font-medium text-black">現金存款</span></div>
                                <span className={`text-xs font-bold mt-0.5 ${currentSavings < Number(formData.amount) ? 'text-red-400' : 'text-gray-800'}`}>餘額: ${formatMoney(currentSavings)}</span>
                             </div>
                            <input type="radio" name="investSource" checked={formData.fromSavings} onChange={() => {}} className="w-5 h-5 text-black accent-black" />
                        </div>
                    </div>
                    
                    {isInvestmentInsufficient && !formData.fromSavings && <div className="flex items-center gap-2 px-2 mt-4 text-red-500 animate-pulse"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}
                    {isSavingsInsufficient && <div className="flex items-center gap-2 px-2 mt-4 text-red-500 animate-pulse"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}
                    {isInvestmentBlockedByEmergency && <div className="flex items-center gap-2 px-2 mt-4 text-red-500 animate-pulse"><ShieldAlert className="w-4 h-4" /><span className="text-xs font-bold">預備金未達標，投資鎖定</span></div>}

                    <div className="mt-5 pt-5 border-t border-gray-100">
                        <p className="text-xs font-bold text-gray-400 mb-3">投資標的</p>
                        {renderAssetChips(name => setFormData({...formData, asset: name}))}
                        {!formData.asset && assets.length > 0 && <p className="text-xs text-gray-400 mt-2">未指定標的不會計入配置比例</p>}
                        {formData.asset && !isCashName(formData.asset) && renderQuantityInput('買到的數量')}
                        {formData.asset && isCashName(formData.asset) && <p className="text-xs text-gray-500 mt-2">入金到交易所或券商、但還沒買資產時選這個。之後買進時，用「劃轉 → 資產轉換」從現金轉出。</p>}
                        {cryptoCap > 0 && (
                            <p className="text-xs text-gray-500 mt-3">
                                加密貨幣比例 {baseCryptoShare.toFixed(1)}%
                                {formData.asset && Number(formData.amount) > 0 && <> ➔ <span className={isCryptoCapExceeded ? 'text-red-500 font-bold' : 'font-bold text-black'}>{projectedCryptoShare.toFixed(1)}%</span></>}
                                <span className="text-gray-400">（上限 {cryptoCap}%）</span>
                            </p>
                        )}
                        {isCryptoCapExceeded && (
                            <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-500">
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span className="text-xs font-bold">這筆投入會讓加密貨幣超過你設定的上限。依規則，這筆應該改投入其他標的。</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : formData.type === 'expense' ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex gap-2">
                        <button onClick={() => setFormData({...formData, tag: 'need'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'need' ? 'bg-gray-100 text-black border-gray-200' : 'bg-white text-gray-400 border-gray-200'}`}>需要</button>
                        <button onClick={() => setFormData({...formData, tag: 'want'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'want' ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-white text-gray-400 border-gray-200'}`}>想要</button>
                        <button onClick={() => setFormData({...formData, tag: 'advance'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'advance' ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-white text-gray-400 border-gray-200'}`}>代墊</button>
                    </div>
                    {formData.tag === 'advance' && <p className="text-xs text-gray-500 px-1 -mt-2">代墊會先從現金扣除，但不算入需要/想要；收到還款時記成收入並勾選「代墊還款」。</p>}
                    <div onClick={() => setFormData({...formData, isDebtRepayment: !formData.isDebtRepayment, isInstallment: false})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.isDebtRepayment ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.isDebtRepayment ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}><CreditCard className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.isDebtRepayment ? 'text-gray-800' : 'text-gray-500'}`}>償還負債</span></div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.isDebtRepayment ? 'bg-black border-black' : 'border-gray-300'}`}>{formData.isDebtRepayment && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {formData.isDebtRepayment && (
                        <>
                            {renderLiabilityChips()}
                            <p className="text-xs text-gray-500 px-1">還款是實際的現金支出，會計入本月支出並減少負債，但不算入需要／想要。</p>
                        </>
                    )}
                    <div onClick={() => setFormData({...formData, fromSavings: !formData.fromSavings, fromEmergency: false, isInstallment: false})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.fromSavings ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.fromSavings ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}><PiggyBank className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.fromSavings ? 'text-gray-800' : 'text-gray-500'}`}>現金存款</span>{formData.fromSavings && <span className="text-xs text-red-500 font-medium">餘額: ${formatMoney(currentSavings)}</span>}</div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.fromSavings ? 'bg-black border-black' : 'border-gray-300'}`}>{formData.fromSavings && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {isSavingsInsufficient && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}

                    <div onClick={() => setFormData({...formData, fromEmergency: !formData.fromEmergency, fromSavings: false, isInstallment: false})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.fromEmergency ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.fromEmergency ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400'}`}><ShieldAlert className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.fromEmergency ? 'text-red-500' : 'text-gray-500'}`}>緊急預備金</span>{formData.fromEmergency && <span className="text-xs text-red-500 font-medium">餘額: ${formatMoney(currentEmergency)}</span>}</div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.fromEmergency ? 'bg-red-500 border-red-500' : 'border-gray-300'}`}>{formData.fromEmergency && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {isEmergencyInsufficient && <div className="flex items-center gap-2 px-2 text-red-500"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">餘額不足</span></div>}
                </div>
            ) : (
                <div className="p-4 flex flex-col gap-3">
                    <div onClick={() => setFormData({...formData, isAssetLiquidation: !formData.isAssetLiquidation, isReimbursement: false, isLoanDisbursement: false, asset: ''})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.isAssetLiquidation ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.isAssetLiquidation ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}><RefreshCcw className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.isAssetLiquidation ? 'text-gray-800' : 'text-gray-500'}`}>資產變現</span></div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.isAssetLiquidation ? 'bg-black border-black' : 'border-gray-300'}`}>{formData.isAssetLiquidation && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {formData.isAssetLiquidation && (
                        <div className="px-1 pb-1">
                            <p className="text-xs text-gray-500 mb-2">賣出哪個標的？（選填，會從配置中扣除）</p>
                            {renderAssetChips(name => setFormData({...formData, asset: name}))}
                            {formData.asset && !isCashName(formData.asset) && renderQuantityInput('賣出的數量')}
                        </div>
                    )}

                    <div onClick={() => setFormData({...formData, isReimbursement: !formData.isReimbursement, isAssetLiquidation: false, isLoanDisbursement: false, asset: ''})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.isReimbursement ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.isReimbursement ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}><Tag className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.isReimbursement ? 'text-gray-800' : 'text-gray-500'}`}>代墊還款</span></div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.isReimbursement ? 'bg-black border-black' : 'border-gray-300'}`}>{formData.isReimbursement && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>

                    <div onClick={() => setFormData({...formData, isLoanDisbursement: !formData.isLoanDisbursement, isAssetLiquidation: false, isReimbursement: false, asset: ''})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.isLoanDisbursement ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.isLoanDisbursement ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}><CreditCard className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.isLoanDisbursement ? 'text-gray-800' : 'text-gray-500'}`}>學貸／借款撥款</span></div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.isLoanDisbursement ? 'bg-black border-black' : 'border-gray-300'}`}>{formData.isLoanDisbursement && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {formData.isLoanDisbursement && (
                        <>
                            {renderLiabilityChips()}
                            <p className="text-xs text-gray-500 px-1">借來的錢會進入現金存款並增加負債，不算收入，也不會變成投資額度。要用它付房租時，支出選「現金存款」支付。</p>
                        </>
                    )}
                </div>
            )}
        </div>
        <div className="bg-white rounded-2xl overflow-hidden  p-5">
            <input type="text" placeholder="新增備註..." value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full text-base bg-transparent outline-none placeholder-gray-400" />
        </div>
        {formData.type === 'expense' && formData.category !== '投資' && !editingId && !formData.fromSavings && !formData.fromEmergency && (
            <div className="bg-white rounded-2xl overflow-hidden  p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-black"><CreditCard className="w-5 h-5" /></div><span className="text-base font-bold text-gray-900">分期付款</span></div>
                    <div onClick={() => setFormData({...formData, isInstallment: !formData.isInstallment})} className={`w-12 h-7 rounded-full p-1 cursor-pointer transition-colors duration-300 ease-in-out ${formData.isInstallment ? 'bg-green-500' : 'bg-gray-200'}`}><div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${formData.isInstallment ? 'translate-x-5' : 'translate-x-0'}`}></div></div>
                </div>
                {formData.isInstallment && (
                    <div className="mt-5 pt-5 border-t border-gray-50 space-y-4 animate-slide-down">
                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button onClick={() => setFormData({...formData, installmentCalcType: 'total'})} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'total' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>輸入總額</button>
                            <button onClick={() => setFormData({...formData, installmentCalcType: 'monthly'})} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'monthly' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>輸入每期</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-gray-400 block mb-2">期數 (月)</label>
                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={formData.installmentCount} onChange={e => { const val = e.target.value; if (val === '' || /^\d+$/.test(val)) setFormData({ ...formData, installmentCount: val, amount: formData.installmentCalcType === 'monthly' && formData.perMonthInput && val ? String(Number(formData.perMonthInput) * Number(val)) : formData.amount }); }} className="w-full bg-gray-50 rounded-xl p-3 text-center font-bold text-black border border-gray-100 focus:border-black outline-none" />
                            </div>
                            <div><label className="text-xs font-bold text-gray-400 block mb-2">金額</label>
                                {formData.installmentCalcType === 'total' ? ( <div className="w-full bg-gray-50 rounded-xl p-3 text-center font-bold text-gray-500 border border-gray-100 flex items-center justify-center gap-1"><Calculator className="w-3 h-3 opacity-50" />${formData.amount && formData.installmentCount ? Math.floor(Number(formData.amount) / Number(formData.installmentCount)).toLocaleString() : 0}</div> ) : (
                                    <input type="text" placeholder="0" value={formData.perMonthInput} readOnly={false} inputMode="numeric" onChange={e => { const val = e.target.value; if (/^\d*$/.test(val)) setFormData({ ...formData, perMonthInput: val, amount: val && formData.installmentCount ? String(Number(val) * Number(formData.installmentCount)) : '' }); }} className="w-full bg-white rounded-xl p-3 text-center font-bold text-black border-2 border-blue-100 focus:border-blue-500 outline-none cursor-pointer" />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}
        <div className="flex gap-3 pt-4">
            {editingId && (<button onClick={(e) => requestDelete(e as any, editingId)} className="flex-1 bg-white text-red-500 py-3.5 rounded-xl font-bold border border-gray-200 shadow-sm hover:bg-gray-50 transition flex items-center justify-center gap-2"><Trash2 className="w-5 h-5" /> 刪除</button>)}
            <button onClick={handleSave} disabled={isSubmitDisabled} className={`flex-1 py-3.5 rounded-xl font-bold transition flex items-center justify-center gap-2 ${isSubmitDisabled ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-black text-white'}`}>{isSubmitDisabled ? <Lock className="w-5 h-5" /> : <Save className="w-5 h-5" />} {editingId ? '儲存變更' : '新增紀錄'}</button>
        </div>
        </div>
    );
  };

  const renderHistoryView = () => {
    // 修正：先複製再排序，不直接改動 state
    const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const today = getLocalDayString(); 
    const filtered = sorted.filter(t => {
        if (hideFuture && t.date > today) return false;
        if (filterCategory && t.category !== filterCategory) return false;
        if (filterTag && t.tag !== filterTag) return false;
        return true;
    });

    const groupedTransactions = filtered.reduce((groups: { [key: string]: Transaction[] }, t) => {
        const date = new Date(t.date);
        const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
        return groups;
      }, {});

    const handleTouchStart = (e: React.TouchEvent, id: number) => { touchStartX.current = e.targetTouches[0].clientX; };
    const handleTouchMove = (e: React.TouchEvent, id: number) => { if (touchStartX.current === null) return; const currentX = e.targetTouches[0].clientX; const diff = touchStartX.current - currentX; if (diff > 50) setSwipedId(id); else if (diff < -50 && swipedId === id) setSwipedId(null); };
    const handleTouchEnd = () => { touchStartX.current = null; };

    const filterTagStyle = filterTag === 'want'
        ? { wrap: 'bg-gray-100 border-gray-200', text: 'text-gray-800' }
        : filterTag === 'advance'
        ? { wrap: 'bg-gray-100 border-gray-200', text: 'text-gray-800' }
        : { wrap: 'bg-gray-100 border-gray-200', text: 'text-black' };

    return (
      <div className="space-y-6 pb-4 pt-2">
        <div className="flex justify-between items-center px-1">
          <div>
            <h2 className="text-3xl font-bold text-black tracking-tight">紀錄</h2>
            <p className="text-xs font-semibold text-gray-400 mt-1">{filtered.length} 筆 {hideFuture && '(隱藏未來)'}</p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setFilterTag(filterTag === 'want' ? null : 'want')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold transition border ${filterTag === 'want' ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'}`}>
                {filterTag === 'want' ? <Heart className="w-3.5 h-3.5 fill-current" /> : <Heart className="w-3.5 h-3.5" />}
                Want
            </button>
            <button onClick={() => setFilterTag(filterTag === 'need' ? null : 'need')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold transition border ${filterTag === 'need' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:bg-gray-50'}`}>
                {filterTag === 'need' ? <ShoppingBag className="w-3.5 h-3.5 fill-current" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                Need
            </button>
            <button onClick={() => setFilterTag(filterTag === 'advance' ? null : 'advance')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold transition border ${filterTag === 'advance' ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-100'}`}>
                <Tag className="w-3.5 h-3.5" />
                代墊
            </button>
            <button onClick={() => setHideFuture(!hideFuture)} className={`w-8 h-8 rounded-full flex items-center justify-center border transition ${!hideFuture ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200'}`}>
                {!hideFuture ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        {(filterCategory || filterTag) && (
            <div className="flex flex-wrap gap-2">
                {filterCategory && (
                    <div className="bg-black/5 rounded-xl p-2 pl-3 flex items-center gap-2 border border-black/5 animate-fade-in">
                        <span className="text-xs font-bold text-gray-500">分類:</span>
                        <span className="text-sm font-bold text-black">{filterCategory}</span>
                        <button onClick={() => setFilterCategory(null)} className="w-5 h-5 rounded-full bg-white text-gray-400 flex items-center justify-center hover:text-black"><X className="w-3 h-3" /></button>
                    </div>
                )}
                {filterTag && (
                    <div className={`rounded-xl p-2 pl-3 flex items-center gap-2 border animate-fade-in ${filterTagStyle.wrap}`}>
                        <span className={`text-xs font-bold ${filterTagStyle.text}`}>標籤:</span>
                        <span className={`text-sm font-bold ${filterTagStyle.text}`}>{tagLabel(filterTag)}</span>
                        <button onClick={() => setFilterTag(null)} className="w-5 h-5 rounded-full bg-white/50 text-gray-500 flex items-center justify-center hover:text-black"><X className="w-3 h-3" /></button>
                    </div>
                )}
            </div>
        )}

        {Object.entries(groupedTransactions).map(([groupName, groupItems]) => (
          <div key={groupName}>
            <h4 className="text-xs font-bold text-gray-400 mb-2 ml-1">{groupName}</h4>
            <div className="bg-white rounded-2xl overflow-hidden  border border-gray-100 divide-y divide-gray-50">
              {(groupItems as Transaction[]).map(t => {
                const isTransfer = t.type === 'transfer';
                const isAdjust = t.type === 'adjust';
                return (
                <div key={t.id} className="relative overflow-hidden" onTouchStart={(e) => handleTouchStart(e, t.id)} onTouchMove={(e) => handleTouchMove(e, t.id)} onTouchEnd={handleTouchEnd}>
                    <div className="absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-center z-0" onClick={(e) => requestDelete(e, t.id)}><Trash2 className="w-6 h-6 text-white" /></div>
                    <div onClick={() => openEditMode(t)} className={`p-4 flex justify-between items-center bg-white relative z-10 transition-transform duration-300 ease-out ${swipedId === t.id ? '-translate-x-24' : 'translate-x-0'} active:bg-gray-50`}>
                        <div className="flex items-center gap-4 overflow-hidden">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-green-50 text-green-600' : t.category === '投資' ? 'bg-gray-100 text-black' : isTransfer ? 'bg-gray-100 text-gray-500' : t.tag === 'advance' ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-500'}`}>
                                {t.category === '投資' ? <TrendingUp className="w-5 h-5" /> : isTransfer ? <RefreshCcw className="w-5 h-5" /> : t.tag === 'advance' ? <Tag className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-bold text-gray-900 text-base truncate">{t.category}</p>
                                    {t.category === '投資' && t.asset && <span className="bg-black text-white text-xs font-bold px-1.5 py-0.5 rounded-md">{t.asset}</span>}
                                    {t.groupId && <span className="bg-gray-100 text-black text-xs font-bold px-1.5 py-0.5 rounded-md">分期</span>}
                                    {t.fromSavings && <span className="bg-gray-100 text-gray-800 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><PiggyBank className="w-2.5 h-2.5" /> 存款</span>}
                                    {t.fromEmergency && <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><ShieldAlert className="w-2.5 h-2.5" /> 預備金</span>}
                                    {t.isAssetLiquidation && <span className="bg-gray-100 text-gray-800 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><RefreshCcw className="w-2.5 h-2.5" /> 變現{t.asset ? ` ${t.asset}` : ''}</span>}
                                    {t.isLoanDisbursement && <span className="bg-gray-100 text-gray-800 text-xs font-bold px-1.5 py-0.5 rounded-md">借款撥款{t.liability ? `・${t.liability}` : ''}</span>}
                                    {t.isDebtRepayment && <span className="bg-gray-100 text-gray-800 text-xs font-bold px-1.5 py-0.5 rounded-md">償還負債{t.liability ? `・${t.liability}` : ''}</span>}
                                    {t.isReimbursement && <span className="bg-gray-100 text-gray-800 text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" /> 代墊還款</span>}
                                    {isAdjust && <span className="bg-gray-100 text-gray-800 text-xs font-bold px-1.5 py-0.5 rounded-md">{t.adjustTarget === 'savings' ? '現金存款' : t.adjustTarget === 'cumulative' ? '歷史可加碼' : '預備金'}</span>}
                                    {isTransfer && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${t.transferDirection === 'to_savings' ? 'bg-gray-100 text-gray-800' : t.transferDirection === 'to_investable' ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800'}`}>{t.transferDirection === 'to_savings' ? '投資➔存款' : t.transferDirection === 'to_investable' ? '存款➔投資' : t.transferDirection === 'invest_to_emergency' ? '投資➔預備金' : t.transferDirection === 'asset_swap' ? `${t.fromAsset || '?'}➔${t.asset || '?'}` : '存款➔預備金'}</span>}
                                </div>
                                <p className="text-xs text-gray-400 truncate mt-0.5">{t.date} • {t.note || '無備註'}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className={`font-bold text-base ${t.type === 'income' ? 'text-green-600' : isTransfer ? 'text-gray-500' : 'text-black'}`}>
                                {isAdjust ? (t.amount >= 0 ? '+' : '−') : t.type === 'income' ? '+' : isTransfer ? '⇌' : '-'}{formatMoney(isAdjust ? Math.abs(t.amount) : t.amount)}
                            </p>
                            {t.category !== '投資' && t.type === 'expense' && !t.isDebtRepayment && (
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.tag === 'need' ? 'bg-gray-100 text-gray-500' : t.tag === 'advance' ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800'}`}>{tagLabel(t.tag)}</span>
                            )}
                        </div>
                    </div>
                </div>
              )})}
            </div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-20 text-gray-400"><p>無紀錄</p></div>}
      </div>
    );
  };

  const renderMarketBar = () => {
    const fetchedAt = market.fetchedAt ? new Date(market.fetchedAt) : null;
    return (
      <CardContainer className="px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">市場資料</p>
          <p className={`text-xs mt-0.5 truncate ${marketStatus === 'error' ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
            {marketStatus === 'error' ? marketError : fetchedAt ? `上次更新 ${fetchedAt.toLocaleString()}` : '尚未更新，按右邊按鈕抓取價格與波動度'}
          </p>
        </div>
        <button onClick={refreshMarket} disabled={marketStatus === 'loading'}
          className="flex-shrink-0 flex items-center gap-1.5 bg-black text-white px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
          <RefreshCcw className={`w-3.5 h-3.5 ${marketStatus === 'loading' ? 'animate-spin' : ''}`} />
          {marketStatus === 'loading' ? '更新中' : '更新價格'}
        </button>
      </CardContainer>
    );
  };

  const renderAllocationCard = () => {
    const { values, source } = getAssetValues(stats.investment.assetTotals, stats.investment.assetQty);
    const rows = assets.map((a, i) => ({ ...a, value: values[a.name] || 0, source: source[a.name], color: COLORS[i % COLORS.length] }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    const cryptoShare = calcCryptoShare(values, assets);
    const cap = initialStats.cryptoCap || 0;
    const isOverCap = cap > 0 && cryptoShare > cap;
    const hasEstimate = rows.some(r => r.value > 0 && r.source === 'estimate');

    return (
      <CardContainer className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Coins className="w-4 h-4 text-black" /><h3 className="text-base font-bold text-gray-900">投資組合配置</h3></div>
          <button onClick={() => { setSettingsPage('assets'); setActiveTab('settings'); }} className="text-sm font-bold" style={{ color: THEME.accentGold }}>編輯</button>
        </div>

        {total > 0 ? (
          <>
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-xs text-gray-400 font-bold">總值</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums">${formatMoney(total)}</span>
            </div>
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100 mb-4">
              {rows.filter(r => r.value > 0).map(r => (
                <div key={r.name} className="h-full" style={{ width: `${(r.value / total) * 100}%`, backgroundColor: r.color }}></div>
              ))}
            </div>
            <div className="space-y-2.5">
              {rows.map(r => (
                <div key={r.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }}></div>
                    <span className="text-sm font-bold text-gray-800">{r.name}</span>
                    {r.value > 0 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${r.source === 'market' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{r.source === 'market' ? '市值' : '估算'}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-gray-900">${formatMoney(r.value)}</span>
                    <span className="text-xs text-gray-400 w-9 text-right tabular-nums">{((r.value / total) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>

            {cap > 0 && (
              <div className={`mt-4 p-3 rounded-xl border ${isOverCap ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-xs font-bold ${isOverCap ? 'text-red-500' : 'text-gray-600'}`}>加密貨幣比例</span>
                  <span className={`text-sm font-bold tabular-nums ${isOverCap ? 'text-red-500' : 'text-black'}`}>{cryptoShare.toFixed(1)}% <span className="text-xs font-medium text-gray-400">/ 上限 {cap}%</span></span>
                </div>
                <div className="relative h-1.5 bg-gray-200 rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(cryptoShare, 100)}%`, backgroundColor: isOverCap ? '#FF3B30' : '#000' }}></div>
                  <div className="absolute -top-1 w-0.5 h-3 bg-gray-500" style={{ left: `${Math.min(cap, 100)}%` }}></div>
                </div>
                {isOverCap && <p className="text-xs text-red-500 mt-2">超過上限：新資金請優先投入非加密貨幣標的。</p>}
              </div>
            )}
            {hasEstimate && <p className="text-xs text-gray-400 mt-3">標示「估算」的標的沒有持有數量或價格資料，以「起始金額 + 投入 − 變現」計算。到設定填入持有數量即可改用市值。</p>}
          </>
        ) : (
          <p className="text-xs text-gray-400 py-2">到設定填入各標的的持有數量，再按「更新價格」，就會用市值計算配置。</p>
        )}
      </CardContainer>
    );
  };

  const renderRiskCard = () => {
    const { values } = getAssetValues(stats.investment.assetTotals, stats.investment.assetQty);
    const items = assets.map(a => ({ name: a.name, kind: a.kind, leverage: a.leverage || 1, value: values[a.name] || 0 })).filter(i => i.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    if (total <= 0) return null;

    // 1. 實際曝險（把槓桿算進去）
    // 現金不是市場曝險，所以不算進曝險，只算進淨值
    const exposureTotal = items.filter(i => i.kind !== 'cash').reduce((s, i) => s + i.value * i.leverage, 0);
    const cashValue = items.filter(i => i.kind === 'cash').reduce((s, i) => s + i.value, 0);
    const exposureByKind = (['crypto', 'equity', 'other'] as AssetKind[])
      .map(k => ({ kind: k, value: items.filter(i => i.kind === k).reduce((s, i) => s + i.value * i.leverage, 0) }))
      .filter(k => k.value > 0);

    // 2. 風險貢獻
    const cashNames = new Set(assets.filter(a => a.kind === 'cash').map(a => a.name));
    const risk = computeRisk(items, market, riskWindow, cashNames);
    const hasRiskData = risk.contributions.length > 0;
    const cryptoNames = new Set(assets.filter(a => a.kind === 'crypto').map(a => a.name));
    const cryptoRisk = risk.contributions.filter(c => cryptoNames.has(c.name)).reduce((s, c) => s + c.risk, 0);
    const cryptoWeight = risk.contributions.filter(c => cryptoNames.has(c.name)).reduce((s, c) => s + c.weight, 0);

    // 3. 壓力測試
    const shockCrypto = (initialStats.stressCrypto ?? 70) / 100;
    const shockEquity = (initialStats.stressEquity ?? 35) / 100;
    const stressLoss = items.reduce((s, i) => {
      const base = i.kind === 'crypto' ? shockCrypto : i.kind === 'equity' ? shockEquity : 0;
      return s + i.value * Math.min(1, base * i.leverage);
    }, 0);

    const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

    return (
      <CardContainer className="p-5">
        <div className="flex items-center gap-2 mb-4"><Activity className="w-4 h-4 text-black" /><h3 className="text-base font-bold text-gray-900">風險分析</h3></div>

        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">實際曝險（含槓桿）</span>
            <span className="text-base font-bold tabular-nums">${formatMoney(exposureTotal)} <span className="text-xs font-medium text-gray-400">/ 淨值 ${formatMoney(total)}</span></span>
          </div>
          <div className="flex flex-wrap gap-2">
            {exposureByKind.map(k => (
              <span key={k.kind} className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">{ASSET_KIND_LABEL[k.kind]} {exposureTotal > 0 ? pct(k.value / exposureTotal) : '0%'}</span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            曝險是淨值的 <b>{(exposureTotal / total).toFixed(2)} 倍</b>
            {cashValue > 0 && <>，其中投資現金 ${formatMoney(cashValue)}（{pct(cashValue / total)}）不承擔市場風險</>}。
          </p>
        </div>

        <div className="mb-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-600">風險貢獻</span>
            <div className="flex bg-gray-100 p-0.5 rounded-lg">
              <button onClick={() => setRiskWindow('long')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${riskWindow === 'long' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>長期 3 年</button>
              <button onClick={() => setRiskWindow('short')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${riskWindow === 'short' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>短期半年</button>
            </div>
          </div>
          {hasRiskData ? (
            <>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs text-gray-500">組合年化波動</span>
                <span className="text-lg font-bold tabular-nums">{pct(risk.portfolioVol)}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center text-xs text-gray-400">
                  <span className="flex-1">標的</span><span className="w-14 text-right">資金</span><span className="w-14 text-right">風險</span>
                </div>
                {risk.contributions.map(c => (
                  <div key={c.name} className="flex items-center">
                    <span className="flex-1 text-base text-black">{c.name} <span className="text-xs text-gray-400">波動 {pct(c.vol)}</span></span>
                    <span className="w-14 text-right text-base tabular-nums text-gray-500">{pct(c.weight)}</span>
                    <span className={`w-14 text-right text-base font-bold tabular-nums ${c.risk > c.weight + 0.05 ? 'text-red-500' : 'text-black'}`}>{pct(c.risk)}</span>
                  </div>
                ))}
              </div>
              {cryptoWeight > 0 && (
                <p className="text-xs text-gray-600 mt-3 bg-gray-50 rounded-lg px-3 py-2">加密貨幣佔資金 <b>{pct(cryptoWeight)}</b>，貢獻組合風險 <b>{pct(cryptoRisk)}</b>。</p>
              )}
              {(risk.missing.length > 0 || risk.missingCorr) && (
                <p className="text-xs text-red-500 mt-2">
                  {risk.missing.length > 0 && `${risk.missing.join('、')} 沒有波動度資料，未納入計算。`}
                  {risk.missingCorr && '部分相關係數缺漏，以 0 計算。'}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400">按上方「更新價格」取得波動度與相關係數後才能計算。</p>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-bold text-gray-600">壓力測試</span>
            <span className="text-xs text-gray-400">加密貨幣 −{initialStats.stressCrypto ?? 70}%、股票 −{initialStats.stressEquity ?? 35}%（槓桿加倍）</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">可能損失</span>
            <span className="text-2xl font-bold tabular-nums text-red-500">−${formatMoney(stressLoss)}</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-sm text-gray-500">剩下</span>
            <span className="text-sm font-bold tabular-nums">${formatMoney(total - stressLoss)}（{pct(stressLoss / total)} 跌幅）</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">情境可在設定調整。問自己：看到這個數字，你還會繼續照規則投入嗎？</p>
        </div>
      </CardContainer>
    );
  };

  const signed = (v: number) => `${v >= 0 ? '+' : '−'}$${formatMoney(Math.abs(v))}`;
  const pnlColor = (v: number) => (Math.round(v) === 0 ? 'text-gray-500' : v > 0 ? 'text-green-600' : 'text-red-500');
  const pctText = (v: number | null) => (v === null ? '' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);

  const renderPnlCard = () => {
    const ledger = computeLedger();
    if (ledger.rows.length === 0) return null;
    return (
      <div>
        <div className="flex items-center justify-between px-4 mb-1.5">
          <span className="text-sm text-gray-500">投資損益</span>
          <button onClick={() => { setSettingsPage('costs'); setActiveTab('settings'); }} className="text-sm font-bold" style={{ color: THEME.accentGold }}>設定成本</button>
        </div>
        <CardContainer className="divide-y divide-gray-100">
          {ledger.rows.filter(r => !r.isCash).map(r => (
            <div key={r.unit} className="px-4 py-3">
              <div className="flex justify-between items-baseline">
                <span className="text-base text-black">{r.unit}</span>
                <span className={`text-base font-bold tabular-nums ${pnlColor(r.unrealized)}`}>{signed(r.unrealized)}</span>
              </div>
              <div className="flex justify-between items-baseline mt-0.5">
                <span className="text-sm text-gray-500 tabular-nums">成本 ${formatMoney(r.cost)}・市值 ${formatMoney(r.value)}</span>
                <span className={`text-sm tabular-nums ${pnlColor(r.unrealized)}`}>{pctText(r.pct)}</span>
              </div>
              {(Math.round(r.realized) !== 0 || r.xirr !== null) && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {Math.round(r.realized) !== 0 && <>已實現 <span className={pnlColor(r.realized)}>{signed(r.realized)}</span></>}
                  {Math.round(r.realized) !== 0 && r.xirr !== null && '・'}
                  {r.xirr !== null && <>年化 {pctText(r.xirr)}</>}
                </p>
              )}
              {r.missingCost && <p className="text-sm text-red-500 mt-0.5">尚未設定成本，損益不正確</p>}
            </div>
          ))}
          <div className="px-4 py-3">
            <div className="flex justify-between items-baseline">
              <span className="text-base font-bold text-black">合計（未實現）</span>
              <span className={`text-xl font-bold tabular-nums ${pnlColor(ledger.totalUnrealized)}`}>{signed(ledger.totalUnrealized)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-0.5">
              <span className="text-sm text-gray-500 tabular-nums">成本 ${formatMoney(ledger.totalCost)}・市值 ${formatMoney(ledger.totalValue)}</span>
              <span className="text-sm text-gray-500">{ledger.portfolioXirr !== null ? `年化 ${pctText(ledger.portfolioXirr)}` : ''}</span>
            </div>
            {Math.round(ledger.totalRealized) !== 0 && <p className="text-sm text-gray-500 mt-0.5">已實現合計 <span className={pnlColor(ledger.totalRealized)}>{signed(ledger.totalRealized)}</span></p>}
          </div>
        </CardContainer>
        <p className="text-sm text-gray-500 px-4 mt-1.5 leading-relaxed">
          市值依上次更新的價格計算，成本採平均成本法。年化報酬（XIRR）考慮每筆投入的時間，期間少於三個月不顯示。
          {ledger.untagged > 0 && ` 有 ${ledger.untagged} 筆投資沒有標記標的，不列入計算（若已含在起始成本中，這是正常的）。`}
        </p>
      </div>
    );
  };

  const renderNetWorthCard = () => {
    const nowStats = stats.getMonthStats(getLocalMonthString());
    const { values } = getAssetValues(nowStats.assetTotals, nowStats.assetQty);
    const investNow = assets.reduce((s, a) => s + (values[a.name] || 0), 0);
    const cashNow = getAppCashTotal(nowStats);
    const debtNow = computeLiabilities().total;
    const totalNow = cashNow + investNow - debtNow;
    const last = netWorth[netWorth.length - 1];
    const prev = netWorth.length >= 2 ? netWorth[netWorth.length - 2] : null;

    // 上一期到這一期：淨資產變化拆成「存下的現金」、「新投入」與「市場漲跌」
    let breakdown: { saved: number; invested: number; market: number; debt: number } | null = null;
    if (last && prev) {
      const inRange = (d: string) => d > prev.date && d <= last.date;
      const known = (n?: string) => !!n && assets.some(a => a.name === n);
      const invested = transactions.filter(t => inRange(t.date) && t.type === 'expense' && t.category === '投資' && known(t.asset)).reduce((s, t) => s + t.amount, 0)
        - transactions.filter(t => inRange(t.date) && t.type === 'income' && t.isAssetLiquidation && known(t.asset)).reduce((s, t) => s + t.amount, 0);
      breakdown = { saved: last.cash - prev.cash, invested, market: last.invest - prev.invest - invested, debt: (last.debt || 0) - (prev.debt || 0) };
    }

    return (
      <div>
        <SectionHeader>淨資產</SectionHeader>
        <CardContainer className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight tabular-nums">${formatMoney(totalNow)}</span>
            {last && prev && <span className={`text-sm font-bold tabular-nums ${pnlColor(last.total - prev.total)}`}>{signed(last.total - prev.total)} 較上期</span>}
          </div>
          <p className="text-sm text-gray-500 mt-1 tabular-nums">現金 ${formatMoney(cashNow)}・投資 ${formatMoney(investNow)}{debtNow > 0 && <>・負債 −${formatMoney(debtNow)}</>}</p>

          {netWorth.length >= 2 && (
            <div className="h-40 mt-4 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={netWorth} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#8E8E93' }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={['auto', 'auto']} />
                  <RechartsTooltip formatter={(v: any) => `$${formatMoney(Number(v))}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="total" name="淨資產" stroke={THEME.accentGold} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="cash" name="現金" stroke="#C7C7CC" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {breakdown && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5">
              <p className="text-sm text-gray-500 mb-1">{prev!.month} ➔ {last!.month} 的變化來源</p>
              <div className="flex justify-between text-base"><span>現金增減</span><span className={`tabular-nums ${pnlColor(breakdown.saved)}`}>{signed(breakdown.saved)}</span></div>
              <div className="flex justify-between text-base"><span>新投入</span><span className="tabular-nums text-gray-600">{signed(breakdown.invested)}</span></div>
              <div className="flex justify-between text-base"><span>市場漲跌</span><span className={`tabular-nums ${pnlColor(breakdown.market)}`}>{signed(breakdown.market)}</span></div>
              {Math.round(breakdown.debt) !== 0 && <div className="flex justify-between text-base"><span>負債增減</span><span className={`tabular-nums ${pnlColor(-breakdown.debt)}`}>{signed(breakdown.debt)}</span></div>}
            </div>
          )}
        </CardContainer>
        <p className="text-sm text-gray-500 px-4 mt-1.5 leading-relaxed">
          {netWorth.length === 0 ? '每次按「更新價格」時會自動記錄一個點，每月一次就夠。' : `已記錄 ${netWorth.length} 個月。每月更新一次價格即可，同月份只保留最新一筆。`}
          現金為 APP 計算的數字，月初做完餘額校正後最準確。
        </p>
      </div>
    );
  };

  const renderInvestmentView = () => (
    <div className="space-y-4 pb-4 pt-2">
      <div className="flex justify-start items-center px-1">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white text-black font-bold text-base rounded-full px-4 py-2 outline-none appearance-none pr-8"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}>
            {availableMonths.map(m => ( <option key={m} value={m}>{m}</option> ))}
          </select>
      </div>
      <div>
        <p className="text-sm text-gray-500 px-4 mb-1.5">本月投資額度</p>
        <CardContainer className="divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-base text-black">這個月可投資</span>
            <span className="text-base font-bold tabular-nums">${formatMoney(stats.investment.monthlyMaxInvestable)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-base text-black">已投入</span>
            <span className="text-base tabular-nums text-gray-600">${formatMoney(stats.investment.actualInvested)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-base text-black">剩餘</span>
            <span className={`text-xl font-bold tabular-nums ${stats.investment.monthlyRemainingInvestable < 0 ? 'text-red-500' : 'text-black'}`}>${formatMoney(stats.investment.monthlyRemainingInvestable)}</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-base text-black">累積未投資</span>
            <span className="text-base tabular-nums text-gray-600">${formatMoney(stats.investment.cumulativeAddOnAvailable)}</span>
          </div>
          {stats.investment.accumulatedDeficit > 0 && (
            <div className="px-4 py-3 flex justify-between items-baseline">
              <span className="text-base text-red-500">超支待補</span>
              <span className="text-base font-bold tabular-nums text-red-500">−${formatMoney(stats.investment.accumulatedDeficit)}</span>
            </div>
          )}
        </CardContainer>
        {(stats.investment.divertedToEmergency > 0 || stats.investment.repaidDeficit > 0 || stats.investment.deficitDeductedFromCumulative > 0) && (
          <p className="text-sm text-gray-500 px-4 mt-1.5 leading-relaxed">
            {stats.investment.divertedToEmergency > 0 && `上月結餘先補預備金 $${formatMoney(stats.investment.divertedToEmergency)}。`}
            {stats.investment.repaidDeficit > 0 && `先補超支 $${formatMoney(stats.investment.repaidDeficit)}。`}
            {stats.investment.deficitDeductedFromCumulative > 0 && `本月超支從累積未投資扣除 $${formatMoney(stats.investment.deficitDeductedFromCumulative)}。`}
          </p>
        )}
      </div>
      {renderMarketBar()}
      {renderAllocationCard()}
      {renderPnlCard()}
      {renderNetWorthCard()}
      {renderRiskCard()}
      <div>
        <p className="text-sm text-gray-500 px-4 mb-1.5">現金存款（結餘的 10%）</p>
        <CardContainer className="divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between items-baseline">
            <span className="text-base text-black">目前累積</span>
            <span className="text-xl font-bold tabular-nums">${formatMoney(stats.investment.savings)}</span>
          </div>
          {stats.investment.savingsExpense > 0 && (
            <div className="px-4 py-3 flex justify-between items-baseline"><span className="text-base text-black">本月動用</span><span className="text-base tabular-nums text-red-500">−${formatMoney(stats.investment.savingsExpense)}</span></div>
          )}
          {stats.investment.assetLiquidation > 0 && (
            <div className="px-4 py-3 flex justify-between items-baseline"><span className="text-base text-black">資產變現入帳</span><span className="text-base tabular-nums text-green-600">+${formatMoney(stats.investment.assetLiquidation)}</span></div>
          )}
          {stats.investment.deficitDeductedFromSavings > 0 && (
            <div className="px-4 py-3 flex justify-between items-baseline"><span className="text-base text-black">超支扣除</span><span className="text-base tabular-nums text-red-500">−${formatMoney(stats.investment.deficitDeductedFromSavings)}</span></div>
          )}
        </CardContainer>
      </div>
    </div>
  );

  const renderReconcileCard = () => {
    const now = stats.getMonthStats(getLocalMonthString());
    const monthly = now.monthlyRemainingInvestable;
    const parts = [
      { label: '緊急預備金', value: now.emergencyFund },
      { label: '現金存款', value: now.savings },
      { label: '歷史可加碼資金', value: now.cumulativeAddOnAvailable },
      { label: '本月剩餘額度', value: monthly },
      { label: '留到下月的額度', value: now.carryToNext },
      { label: '未填補赤字', value: -now.accumulatedDeficit },
    ].filter(p => Math.round(p.value) !== 0);
    const appTotal = parts.reduce((s, p) => s + p.value, 0);
    const actual = Number(reconcileActual);
    const hasActual = reconcileActual !== '' && isFinite(actual);
    const diff = hasActual ? Math.round(actual - appTotal) : 0;

    const handleReconcile = () => {
      if (!hasActual || diff === 0) return;
      const baseId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
      const item: Transaction = {
        id: baseId, date: getLocalDayString(), category: '餘額校正', amount: diff, type: 'adjust', tag: 'transfer',
        note: `實際 ${formatMoney(actual)}，APP ${formatMoney(appTotal)}`, adjustTarget: reconcileTarget,
      };
      setTransactions([item, ...transactions]);
      setReconcileActual('');
    };

    return (
      <CardContainer className="p-4">
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">把 APP 認為你手上有的現金，對齊到帳戶裡實際可動用的金額（扣掉待繳卡費、不含已經買成資產的錢）。差額會記成一筆校正紀錄，之後可以刪除。</p>
        <div className="space-y-1.5 mb-3">
          {parts.map(p => (
            <div key={p.label} className="flex justify-between text-xs"><span className="text-gray-500">{p.label}</span><span className="font-bold tabular-nums">{p.value < 0 ? '−' : ''}${formatMoney(Math.abs(p.value))}</span></div>
          ))}
          <div className="flex justify-between text-sm pt-1.5 border-t border-gray-100"><span className="font-bold">APP 計算的現金合計</span><span className="font-bold tabular-nums">${formatMoney(appTotal)}</span></div>
        </div>
        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 mb-3">
          <span className="text-xs font-bold text-gray-600">實際可動用現金</span>
          <input type="text" inputMode="numeric" placeholder="0" value={reconcileActual}
            onChange={e => { if (/^\d*$/.test(e.target.value)) setReconcileActual(e.target.value); }}
            className="text-right text-base font-bold bg-transparent outline-none w-32" />
        </div>
        {hasActual && (
          <>
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-xs text-gray-500">差額</span>
              <span className={`text-lg font-bold tabular-nums ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-600' : 'text-black'}`}>{diff > 0 ? '+' : diff < 0 ? '−' : ''}${formatMoney(Math.abs(diff))}</span>
            </div>
            {diff !== 0 && (
              <>
                <p className="text-xs text-gray-400 mb-2">差額要調整到哪個部分？</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([['emergency', '預備金'], ['savings', '現金存款'], ['cumulative', '歷史可加碼']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setReconcileTarget(key)} className={`py-2 rounded-xl text-xs font-bold border transition ${reconcileTarget === key ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'}`}>{label}</button>
                  ))}
                </div>
                <button onClick={handleReconcile} className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm">建立校正紀錄</button>
              </>
            )}
          </>
        )}
      </CardContainer>
    );
  };

  const renderSettingsView = () => {
    const handleStatChange = (field: keyof StatsData, value: string) => { if (/^\d*$/.test(value)) setInitialStats(prev => ({...prev, [field]: value === '' ? 0 : Number(value)})); };
    const isAutoEmergency = initialStats.emergencyMode === 'auto';
    const nowStats = stats.getMonthStats(getLocalMonthString());
    
    const limit = 5 * 1024 * 1024;
    const usagePercent = Math.min((storageUsage / limit) * 100, 100);
    const usageColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-gray-500' : 'bg-green-500';

    const PAGE_TITLES: { [key: string]: string } = {
      categories: '分類與預算', emergency: '緊急預備金', initial: '起始數值',
      assets: '投資標的', market: '市場資料', risk: '風險規則', costs: '成本與損益', debts: '負債',
      reconcile: '餘額校正', backup: '備份與匯入',
    };

    // ---------- 子頁面 ----------
    const renderPage = () => {
      switch (settingsPage) {
        case 'categories':
          return (
            <>
              <div>
                <SectionHeader>支出分類</SectionHeader>
                <CardContainer className="p-4">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {expenseCategories.map(cat => (
                      <div key={cat} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-gray-100 rounded-full">
                        <span className="text-sm text-gray-800">{cat}</span>
                        <button onClick={() => handleRemoveCategory(cat)} aria-label={`刪除 ${cat}`} className="w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center active:bg-red-500 transition"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="新增分類" value={newCategoryInput} onChange={e => setNewCategoryInput(e.target.value)} className="flex-1 min-w-0 bg-gray-100 rounded-xl px-4 py-2 text-base outline-none" />
                    <button onClick={handleAddCategory} disabled={!newCategoryInput.trim()} className="px-4 py-2 rounded-xl font-bold text-base text-white disabled:opacity-40" style={{ backgroundColor: THEME.accentGold }}>新增</button>
                  </div>
                </CardContainer>
              </div>
              <div>
                <SectionHeader>每月預算</SectionHeader>
                <CardContainer className="divide-y divide-gray-100">
                  {expenseCategories.map(cat => (
                    <InputRow key={cat} label={cat} placeholder="未設定" value={budgets[cat] || ''} onChange={v => { if (/^\d*$/.test(v)) updateBudget(cat, v); }} />
                  ))}
                </CardContainer>
                <SectionFooter>留空代表不設預算。設定後會出現在總覽的預算進度中。</SectionFooter>
              </div>
            </>
          );

        case 'emergency':
          return (
            <div>
              <CardContainer className="p-1.5 mb-6">
                <div className="flex">
                  <button onClick={() => setInitialStats(prev => ({ ...prev, emergencyMode: 'fixed' }))} className={`flex-1 py-2 text-sm font-bold rounded-xl transition ${!isAutoEmergency ? 'bg-gray-100 text-black' : 'text-gray-400'}`}>固定目標</button>
                  <button onClick={() => setInitialStats(prev => prev.emergencyMode === 'auto' ? prev : ({ ...prev, emergencyMode: 'auto', emergencyAutoFrom: getLocalMonthString() }))} className={`flex-1 py-2 text-sm font-bold rounded-xl transition ${isAutoEmergency ? 'bg-gray-100 text-black' : 'text-gray-400'}`}>依支出自動調整</button>
                </div>
              </CardContainer>
              <CardContainer className="divide-y divide-gray-100">
                <InputRow label="起始金額" value={initialStats.emergencyCurrent || ''} onChange={v => handleStatChange('emergencyCurrent', v)} />
                <InputRow label={isAutoEmergency ? '最低目標' : '目標'} value={initialStats.emergencyGoal || ''} onChange={v => handleStatChange('emergencyGoal', v)} />
                {isAutoEmergency && <InputRow label="幾個月的需要支出" placeholder="6" value={initialStats.emergencyMonths || ''} onChange={v => handleStatChange('emergencyMonths', v)} />}
              </CardContainer>
              <SectionFooter>
                {isAutoEmergency
                  ? (nowStats.needSampleMonths > 0
                    ? `從 ${initialStats.emergencyAutoFrom || getLocalMonthString()} 起生效。目標 = 近 ${nowStats.needSampleMonths} 個月「需要」支出平均 $${formatMoney(nowStats.avgNeed)} × ${initialStats.emergencyMonths || 6} 個月，且不低於最低目標。本月目標 $${formatMoney(nowStats.emergencyGoal)}。`
                    : '還沒有足夠的「需要」支出紀錄，暫時使用最低目標。')
                  : '預備金未達目標前，無法新增投資。'}
              </SectionFooter>
            </div>
          );

        case 'debts': {
          const list = initialStats.liabilities || [];
          const summary = computeLiabilities();
          const setList = (next: Liability[]) => setInitialStats(prev => ({ ...prev, liabilities: next }));
          return (
            <>
              {list.map((l, idx) => {
                const row = summary.rows.find(r => r.name === l.name);
                return (
                  <div key={l.name + idx}>
                    <div className="flex items-center justify-between px-4 mb-1.5">
                      <span className="text-sm text-gray-500">{l.name}</span>
                      {list.length > 1 && <button onClick={() => setList(list.filter((_, i) => i !== idx))} className="text-sm text-red-500">移除</button>}
                    </div>
                    <CardContainer className="divide-y divide-gray-100">
                      <InputRow label="設定時的餘額" value={l.baseBalance || ''} onChange={v => { if (/^\d*$/.test(v)) setList(list.map((x, i) => i === idx ? { ...x, baseBalance: Number(v) || 0 } : x)); }} />
                      <div className="px-4 py-3 flex justify-between"><span className="text-base text-black">之後撥款</span><span className="text-base tabular-nums text-gray-600">+${formatMoney(row?.disbursed || 0)}</span></div>
                      <div className="px-4 py-3 flex justify-between"><span className="text-base text-black">之後還款</span><span className="text-base tabular-nums text-gray-600">−${formatMoney(row?.repaid || 0)}</span></div>
                      <div className="px-4 py-3 flex justify-between"><span className="text-base font-bold text-black">目前餘額</span><span className="text-base font-bold tabular-nums">${formatMoney(row?.balance || 0)}</span></div>
                    </CardContainer>
                  </div>
                );
              })}
              <div>
                <SectionHeader>分期付款</SectionHeader>
                <CardContainer className="divide-y divide-gray-100">
                  {summary.installments.length === 0 ? (
                    <div className="px-4 py-3 text-base text-gray-400">目前沒有未付完的分期</div>
                  ) : summary.installments.map(x => (
                    <div key={x.name + x.lastDate} className="px-4 py-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-base text-black">{x.name}</span>
                        <span className="text-base font-bold tabular-nums">${formatMoney(x.remaining)}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5 tabular-nums">每期 ${formatMoney(x.perMonth)}・還剩 {x.remainingCount} / {x.totalCount} 期・最後一期 {x.lastDate}</p>
                    </div>
                  ))}
                </CardContainer>
                <SectionFooter>分期付款的未到期金額會自動算進負債，不需要另外記錄。每期到期時已經記成支出，負債會自動減少。</SectionFooter>
              </div>

              <CardContainer>
                <div className="px-4 py-3 flex justify-between items-baseline">
                  <span className="text-base font-bold text-black">負債合計</span>
                  <span className="text-xl font-bold tabular-nums">${formatMoney(summary.total)}</span>
                </div>
              </CardContainer>

              <div>
                <SectionHeader>新增負債</SectionHeader>
                <CardContainer className="p-4 flex gap-2">
                  <input type="text" placeholder="例如 信用卡分期" value={newLiabilityName} onChange={e => setNewLiabilityName(e.target.value)} className="flex-1 min-w-0 bg-gray-100 rounded-xl px-3 py-2 text-base outline-none" />
                  <button onClick={() => { const n = newLiabilityName.trim(); if (!n || list.some(l => l.name === n)) return; setList([...list, { name: n, baseBalance: 0 }]); setNewLiabilityName(''); }} disabled={!newLiabilityName.trim()} className="px-3 py-2 rounded-xl text-white disabled:opacity-40" style={{ backgroundColor: THEME.accentGold }} aria-label="新增負債"><Plus className="w-5 h-5" /></button>
                </CardContainer>
                <SectionFooter>「設定時的餘額」填現在的總額，例如學貸目前約 60 萬。之後在記帳時勾選「學貸／借款撥款」或「償還負債」，餘額會自動增減。負債會從淨資產中扣除。</SectionFooter>
              </div>
            </>
          );
        }

        case 'initial':
          return (
            <div>
              <CardContainer className="divide-y divide-gray-100">
                <InputRow label="累積未投資" value={initialStats.available || ''} onChange={v => handleStatChange('available', v)} />
                <InputRow label="第一個月可投資" value={initialStats.initialInvestable || ''} onChange={v => handleStatChange('initialInvestable', v)} />
                <InputRow label="現金存款" value={initialStats.savings || ''} onChange={v => handleStatChange('savings', v)} />
                <InputRow label="存款保留底線" value={initialStats.savingsFloor || ''} onChange={v => handleStatChange('savingsFloor', v)} />
              </CardContainer>
              <SectionFooter>開始記帳前就已經有的金額。之後的數字都從這裡累加。存款低於保留底線時，無法把存款轉去投資。</SectionFooter>
            </div>
          );

        case 'assets':
          return (
            <>
              {assets.map(a => (
                <div key={a.name}>
                  <div className="flex items-center justify-between px-4 mb-1.5">
                    <span className="text-sm text-gray-500">{a.name}</span>
                    <button onClick={() => handleRemoveAsset(a.name)} className="text-sm text-red-500">移除</button>
                  </div>
                  <CardContainer className="divide-y divide-gray-100">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <span className="text-base text-black">類型</span>
                      <select value={a.kind} onChange={e => updateAsset(a.name, { kind: e.target.value as AssetKind })} className="text-base text-gray-600 bg-transparent outline-none text-right">
                        <option value="crypto">加密貨幣</option>
                        <option value="equity">股票/ETF</option>
                        <option value="cash">投資現金</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <span className="text-base text-black">目前價格</span>
                      <span className="text-base text-gray-400 tabular-nums">{a.kind === 'cash' ? '固定為 1' : market.prices[a.name] !== undefined ? `$${formatMoney(market.prices[a.name])}` : '沒有資料'}</span>
                    </div>
                    <InputRow label={a.kind === 'cash' ? '目前金額' : '持有數量'} inputMode="decimal"
                      value={qtyDrafts[a.name] ?? (a.baseQuantity ? String(a.baseQuantity) : '')}
                      onChange={v => { if (/^\d*\.?\d*$/.test(v)) { setQtyDrafts(prev => ({ ...prev, [a.name]: v })); updateAsset(a.name, { baseQuantity: Number(v) || 0 }); } }} />
                    {a.kind !== 'cash' && (
                      <>
                        <InputRow label="槓桿倍數" placeholder="1" value={a.leverage && a.leverage !== 1 ? String(a.leverage) : ''}
                          onChange={v => { if (/^\d*$/.test(v)) updateAsset(a.name, { leverage: Number(v) || 1 }); }} />
                        <InputRow label="手動估值" value={a.baseline || ''}
                          onChange={v => { if (/^\d*$/.test(v)) updateAsset(a.name, { baseline: v === '' ? 0 : Number(v) }); }} />
                      </>
                    )}
                  </CardContainer>
                </div>
              ))}
              <div>
                <SectionHeader>新增標的</SectionHeader>
                <CardContainer className="p-4 flex gap-2">
                  <input type="text" placeholder="例如 0050" value={newAssetName} onChange={e => setNewAssetName(e.target.value)} className="flex-1 min-w-0 bg-gray-100 rounded-xl px-3 py-2 text-base outline-none" />
                  <select value={newAssetKind} onChange={e => setNewAssetKind(e.target.value as AssetKind)} className="bg-gray-100 rounded-xl px-2 py-2 text-base outline-none">
                    <option value="crypto">加密貨幣</option>
                    <option value="equity">股票/ETF</option>
                    <option value="cash">投資現金</option>
                    <option value="other">其他</option>
                  </select>
                  <button onClick={handleAddAsset} disabled={!newAssetName.trim()} className="px-3 py-2 rounded-xl text-white disabled:opacity-40" style={{ backgroundColor: THEME.accentGold }} aria-label="新增標的"><Plus className="w-5 h-5" /></button>
                </CardContainer>
                <SectionFooter>名稱要和試算表 price_ 後面的文字一致（例如 price_BTC 對應 BTC）。有持有數量和價格時用市值計算；沒有價格資料的標的，才會用手動估值。</SectionFooter>
              </div>
            </>
          );

        case 'market':
          return (
            <div>
              <SectionHeader>試算表 CSV 網址</SectionHeader>
              <CardContainer className="p-4">
                <textarea rows={3} placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?...output=csv" value={initialStats.priceCsvUrl || ''}
                  onChange={e => setInitialStats(prev => ({ ...prev, priceCsvUrl: e.target.value.trim() }))}
                  className="w-full text-sm text-gray-600 outline-none resize-none bg-transparent break-all" />
              </CardContainer>
              <SectionFooter>{market.fetchedAt ? `上次更新：${new Date(market.fetchedAt).toLocaleString()}。` : '尚未更新過。'}到投資頁按「更新價格」讀取最新資料。</SectionFooter>
            </div>
          );

        case 'costs': {
          const units: string[] = [];
          assets.forEach(a => { if (a.kind === 'cash') return; const u = unitOf(a.name); if (!units.includes(u)) units.push(u); });
          const combine = initialStats.combineCrypto !== false;
          return (
            <>
              <div>
                <CardContainer>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-base text-black">加密貨幣合併計算</span>
                    <button onClick={() => setInitialStats(prev => ({ ...prev, combineCrypto: !combine }))} aria-label="切換加密貨幣合併計算"
                      className={`w-12 h-7 rounded-full p-1 transition-colors ${combine ? 'bg-green-500' : 'bg-gray-200'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${combine ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                </CardContainer>
                <SectionFooter>開啟時，所有加密貨幣共用一個成本，損益一起計算。交易所總入金金額適合用這個方式。</SectionFooter>
              </div>
              {units.map(u => {
                const base = (initialStats.baseCosts || {})[u] || { cost: 0, date: '' };
                return (
                  <div key={u}>
                    <SectionHeader>{u}</SectionHeader>
                    <CardContainer className="divide-y divide-gray-100">
                      <InputRow label="起始成本" value={base.cost || ''} onChange={v => { if (/^\d*$/.test(v)) updateBaseCost(u, { cost: Number(v) || 0 }); }} />
                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <label className="text-base text-black">平均投入日期</label>
                        <input type="date" value={base.date || ''} onChange={e => updateBaseCost(u, { date: e.target.value })} className="text-base text-right outline-none text-gray-600 bg-transparent" />
                      </div>
                    </CardContainer>
                  </div>
                );
              })}
              <SectionFooter>起始成本填「到目前為止」投入的總金額，包含已經記在 APP 裡、但沒有標記標的的投資。之後標記標的的投資會自動累加。平均投入日期用來計算年化報酬，填大概的中間日期即可。</SectionFooter>
            </>
          );
        }

        case 'risk':
          return (
            <>
              <div>
                <SectionHeader>配置上限</SectionHeader>
                <CardContainer>
                  <InputRow label="加密貨幣上限 (%)" placeholder="不限制" value={initialStats.cryptoCap || ''}
                    onChange={v => { if (/^\d*$/.test(v) && Number(v) <= 100) handleStatChange('cryptoCap', v); }} />
                </CardContainer>
                <SectionFooter>新投入會讓加密貨幣超過上限時，記帳表單會提醒你。</SectionFooter>
              </div>
              <div>
                <SectionHeader>壓力測試情境</SectionHeader>
                <CardContainer className="divide-y divide-gray-100">
                  <InputRow label="加密貨幣跌幅 (%)" placeholder="70" value={initialStats.stressCrypto ?? ''}
                    onChange={v => { if (/^\d*$/.test(v) && Number(v) <= 100) handleStatChange('stressCrypto', v); }} />
                  <InputRow label="股票跌幅 (%)" placeholder="35" value={initialStats.stressEquity ?? ''}
                    onChange={v => { if (/^\d*$/.test(v) && Number(v) <= 100) handleStatChange('stressEquity', v); }} />
                </CardContainer>
                <SectionFooter>槓桿標的的跌幅會乘上槓桿倍數，投資現金不受影響。</SectionFooter>
              </div>
            </>
          );

        case 'reconcile':
          return renderReconcileCard();

        case 'backup':
          return (
            <>
              <div>
                <CardContainer className="divide-y divide-gray-100">
                  <button onClick={handleExportBackup} className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-100 text-left">
                    <Download className="w-5 h-5" style={{ color: THEME.accentGold }} /><span className="text-base text-black">匯出完整備份</span>
                  </button>
                  <button onClick={() => importInputRef.current && importInputRef.current.click()} className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-100 text-left">
                    <RefreshCcw className="w-5 h-5" style={{ color: THEME.accentGold }} /><span className="text-base text-black">匯入備份</span>
                  </button>
                  <button onClick={handleExport} className="w-full px-4 py-3 flex items-center gap-3 active:bg-gray-100 text-left">
                    <Download className="w-5 h-5 text-gray-400" /><span className="text-base text-black">匯出成 CSV（供 Excel 查看）</span>
                  </button>
                </CardContainer>
                <input ref={importInputRef} type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
                {backupMessage && <p className={`text-sm font-bold px-4 mt-2 ${backupMessage.ok ? 'text-green-600' : 'text-red-500'}`}>{backupMessage.text}</p>}
                <SectionFooter>完整備份是 .json 檔，包含所有紀錄與設定，可以匯入還原。CSV 只能查看，無法匯入。資料只存在這個瀏覽器裡，建議每月備份一次。</SectionFooter>
              </div>
              <div>
                <SectionHeader>儲存空間</SectionHeader>
                <CardContainer className="p-4">
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${usageColor}`} style={{ width: `${usagePercent}%` }}></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">已使用 {usagePercent.toFixed(1)}%</p>
                </CardContainer>
              </div>
            </>
          );

        default:
          return null;
      }
    };

    // ---------- 子頁面外框 ----------
    if (settingsPage) {
      return (
        <div className="space-y-6 pt-2 pb-6">
          <div>
            <button onClick={() => setSettingsPage(null)} className="flex items-center -ml-1 mb-2 text-base" style={{ color: THEME.accentGold }}>
              <ChevronLeft className="w-5 h-5" />設定
            </button>
            <h2 className="text-3xl font-bold text-black tracking-tight px-1">{PAGE_TITLES[settingsPage]}</h2>
          </div>
          {renderPage()}
        </div>
      );
    }

    // ---------- 設定首頁 ----------
    const assetCount = assets.length;
    const budgetCount = Object.values(budgets).filter(v => (v as number) > 0).length;

    return (
        <div className="space-y-6 pt-2 pb-6">
          <h2 className="text-3xl font-bold text-black tracking-tight px-1">設定</h2>

          <div>
            <SectionHeader>一般</SectionHeader>
            <CardContainer className="divide-y divide-gray-100">
              <NavRow label="分類與預算" detail={budgetCount > 0 ? `${budgetCount} 項預算` : undefined} onClick={() => setSettingsPage('categories')} />
              <NavRow label="緊急預備金" detail={isAutoEmergency ? '自動' : initialStats.emergencyGoal ? `$${formatMoney(initialStats.emergencyGoal)}` : '未設定'} onClick={() => setSettingsPage('emergency')} />
              <NavRow label="起始數值" onClick={() => setSettingsPage('initial')} />
              <NavRow label="負債" detail={computeLiabilities().total > 0 ? `$${formatMoney(computeLiabilities().total)}` : '未設定'} onClick={() => setSettingsPage('debts')} />
            </CardContainer>
          </div>

          <div>
            <SectionHeader>投資</SectionHeader>
            <CardContainer className="divide-y divide-gray-100">
              <NavRow label="投資標的" detail={`${assetCount} 個`} onClick={() => setSettingsPage('assets')} />
              <NavRow label="市場資料" detail={initialStats.priceCsvUrl ? '已連結' : '未設定'} onClick={() => setSettingsPage('market')} />
              <NavRow label="成本與損益" detail={Object.values(initialStats.baseCosts || {}).filter(b => b.cost > 0).length > 0 ? '已設定' : '未設定'} onClick={() => setSettingsPage('costs')} />
              <NavRow label="風險規則" detail={initialStats.cryptoCap ? `上限 ${initialStats.cryptoCap}%` : undefined} onClick={() => setSettingsPage('risk')} />
            </CardContainer>
          </div>

          <div>
            <SectionHeader>資料</SectionHeader>
            <CardContainer className="divide-y divide-gray-100">
              <NavRow label="餘額校正" onClick={() => setSettingsPage('reconcile')} />
              <NavRow label="備份與匯入" onClick={() => setSettingsPage('backup')} />
            </CardContainer>
          </div>

          <CardContainer>
            <NavRow label="初始化所有資料" danger onClick={() => setResetModal(true)} />
          </CardContainer>

          <p className="text-center text-xs text-gray-400">臨界財富 v10.2</p>
        </div>
    );
  };

  const needsScrolling = activeTab === 'dashboard' || activeTab === 'history' || activeTab === 'form' || activeTab === 'settings' || activeTab === 'investment';
  const scrollContainerClasses = `flex-1 relative p-5 pt-[calc(env(safe-area-inset-top)+20px)] ${needsScrolling ? 'overflow-y-auto hide-scrollbar pb-24' : 'overflow-hidden'}`;

  return (
    <>
      <style>{`body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #F2F2F7; } .hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animation-slide-up { animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; } * { -webkit-tap-highlight-color: transparent; }`}</style>
      <div className="fixed inset-0 w-full h-[100dvh] bg-gray-100 flex justify-center items-center overflow-hidden">
        <div className="w-full max-w-md h-full bg-gray-100 flex flex-col relative shadow-2xl overflow-hidden select-none touch-manipulation overscroll-none" ref={scrollRef}>
           {deleteModal.show && (<div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/20 backdrop-blur-sm animation-fade-in"><div className="bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl w-full max-w-xs text-center overflow-hidden transform scale-100 transition-all"><div className="p-5"><h3 className="text-lg font-bold text-black mb-1">刪除紀錄？</h3><p className="text-sm text-gray-500">此動作無法復原。</p></div><div className="flex border-t border-gray-300/50"><button onClick={() => setDeleteModal({ show: false, id: null })} className="flex-1 py-3 text-lg text-black font-normal border-r border-gray-300/50 active:bg-gray-100">取消</button><button onClick={confirmDelete} className="flex-1 py-3 text-lg text-red-500 font-bold active:bg-gray-100">刪除</button></div></div></div>)}
           {resetModal && (<div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/40 backdrop-blur-sm animation-fade-in"><div className="bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl w-full max-w-xs text-center overflow-hidden transform scale-100 transition-all"><div className="p-5"><AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" /><h3 className="text-lg font-bold text-black mb-1">確認初始化？</h3><p className="text-sm text-gray-500">所有交易紀錄與設定將被永久刪除且無法復原。</p></div><div className="flex border-t border-gray-300/50"><button onClick={() => setResetModal(false)} className="flex-1 py-3 text-lg text-black font-normal border-r border-gray-300/50 active:bg-gray-100">取消</button><button onClick={handleResetApp} className="flex-1 py-3 text-lg text-red-500 font-bold active:bg-gray-100">確認重置</button></div></div></div>)}
           {isCalculatorOpen && (<><div className="absolute inset-0 z-40 bg-transparent" onClick={() => setIsCalculatorOpen(false)}></div><div className="absolute inset-x-0 bottom-0 z-50 bg-black shadow-2xl animation-slide-up flex flex-col pb-[calc(env(safe-area-inset-bottom)+30px)] pt-5 px-3 h-96 rounded-t-3xl"><div className="grid grid-cols-4 gap-2 h-full"><button onClick={() => handleCalcInput('AC')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors">AC</button><button onClick={() => handleCalcInput('DEL')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors"><Delete className="w-6 h-6" /></button><button onClick={() => handleCalcInput('%')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors">%</button><button onClick={() => handleCalcInput('/')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">÷</button><button onClick={() => handleCalcInput('7')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">7</button><button onClick={() => handleCalcInput('8')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">8</button><button onClick={() => handleCalcInput('9')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">9</button><button onClick={() => handleCalcInput('*')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pt-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">×</button><button onClick={() => handleCalcInput('4')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">4</button><button onClick={() => handleCalcInput('5')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">5</button><button onClick={() => handleCalcInput('6')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">6</button><button onClick={() => handleCalcInput('-')} className="h-full rounded-xl bg-black border border-white/20 text-white text-3xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">-</button><button onClick={() => handleCalcInput('1')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">1</button><button onClick={() => handleCalcInput('2')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">2</button><button onClick={() => handleCalcInput('3')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">3</button><button onClick={() => handleCalcInput('+')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">+</button><button onClick={() => handleCalcInput('0')} className="col-span-2 h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center pl-6 transition-colors">0</button><button onClick={() => handleCalcInput('.')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">.</button><button onClick={() => handleCalcInput('=')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold active:bg-gray-800 flex items-center justify-center transition-colors">=</button></div></div></>)}
          <div className={scrollContainerClasses}>
            {activeTab === 'dashboard' && renderDashboardView()}
            {activeTab === 'history' && renderHistoryView()}
            {activeTab === 'form' && renderFormView()}
            {activeTab === 'investment' && renderInvestmentView()}
            {activeTab === 'settings' && renderSettingsView()}
          </div>
          <div className="flex-none bg-white/95 backdrop-blur-xl border-t border-gray-200 pb-[calc(env(safe-area-inset-bottom)+5px)] pt-2 px-2 flex justify-around items-center z-30">
            <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-gray-100 text-black' : 'text-gray-400 active:bg-gray-50'}`}><PieChart className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-xs font-bold">總覽</span></button>
            <button onClick={() => { setActiveTab('history'); setFilterCategory(null); setFilterTag(null); }} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'history' ? 'bg-gray-100 text-black' : 'text-gray-400 active:bg-gray-50'}`}><List className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-xs font-bold">明細</span></button>
            <div className="relative -top-6"><button onClick={handleFabClick} className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform ${activeTab === 'form' && !editingId ? 'bg-gray-900 rotate-45' : 'bg-black'}`}><Plus className="w-7 h-7" strokeWidth={3} /></button></div>
            <button onClick={() => setActiveTab('investment')} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'investment' ? 'bg-gray-100 text-black' : 'text-gray-400 active:bg-gray-50'}`}><TrendingUp className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-xs font-bold">投資</span></button>
            <button onClick={() => { setActiveTab('settings'); setSettingsPage(null); }} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'settings' ? 'bg-gray-100 text-black' : 'text-gray-400 active:bg-gray-50'}`}><Settings className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-xs font-bold">設定</span></button>
          </div>
        </div>
      </div>
    </>
  );
}
