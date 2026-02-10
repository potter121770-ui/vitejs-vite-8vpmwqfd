import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, PieChart, TrendingUp, DollarSign, List, Settings, AlertCircle, Coins, Edit3, Calendar, Info, CreditCard, Calculator, Trash2, ChevronLeft, Save, ShieldCheck, CheckCircle, Coffee, Shield, Delete, X, Eye, EyeOff, Link as LinkIcon, PiggyBank, RefreshCcw, Lock, Download, AlertTriangle, Activity, Filter, Heart, ShieldAlert, Tag, ShoppingBag, Briefcase, Database } from 'lucide-react';
import { 
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip as RechartsTooltip 
} from 'recharts';

// --- Type Definitions ---
interface Transaction {
  id: number;
  date: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
  tag: 'need' | 'want' | 'income' | 'invest_monthly' | 'invest_cumulative';
  note: string;
  groupId?: string;
  investSource?: 'monthly' | 'cumulative';
  fromSavings?: boolean; 
  fromEmergency?: boolean; 
  isAssetLiquidation?: boolean; 
}

interface Budgets {
  [key: string]: number;
}

interface StatsData {
  available: number; 
  savings: number;
  emergencyCurrent: number; 
  emergencyGoal: number; 
  initialInvestable?: number; 
}

interface MonthlyData {
  income: number;            
  assetLiquidation: number; 
  expense: number;          
  installmentExpense: number; 
  savingsExpense: number;  
  emergencyExpense: number;
  actualInvested: number;
  investedFromMonthly: number; 
  investedFromCumulative: number; 
  need: number;
  want: number;
  categoryMap: { [key: string]: number };
}

interface ProcessedMonthData extends MonthlyData {
  netIncome: number;
  monthlyMaxInvestable: number;
  monthlyRemainingInvestable: number;
  cumulativeAddOnAvailable: number;
  deficitDeducted: number; 
  accumulatedDeficit: number; 
  savings: number;
  emergencyFund: number;
  divertedToEmergency: number;
  repaidDeficit: number; 
  capitalDivertedToEmergency: number; 
  emergencyGoal: number;
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
};

// --- 初始資料 ---
const INITIAL_TRANSACTIONS: Transaction[] = [];
const INITIAL_BUDGETS: Budgets = {};
const INITIAL_STATS_DATA: StatsData = {
  available: 0, 
  savings: 0,
  emergencyCurrent: 0, 
  emergencyGoal: 0, 
  initialInvestable: 0 
};

// [NEW] 預設支出分類 (不含收入與投資，這兩者為系統保留)
const DEFAULT_EXPENSE_CATEGORIES = [
  '房租', '飲食', '交通', '電子產品', '健身', '旅遊', '娛樂', '生活雜費', '教育', '醫療'
];

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

// --- UI Components ---
const CardContainer = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 ${className}`}>
    {children}
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [hideFuture, setHideFuture] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<'need' | 'want' | null>(null);
    
  // --- iOS App-Like Behavior Hook ---
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

  // --- State Initialization ---
  
  // [NEW] 自訂分類 State
  const [expenseCategories, setExpenseCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_categories_v2');
      return saved ? JSON.parse(saved) : DEFAULT_EXPENSE_CATEGORIES;
    } catch (e) { return DEFAULT_EXPENSE_CATEGORIES; }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('yupao_transactions_v2');
      return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    } catch (e) { return INITIAL_TRANSACTIONS; }
  });
    
  const [initialStats, setInitialStats] = useState<StatsData>(() => {
    try {
      const saved = localStorage.getItem('yupao_stats_v2');
      const parsed = saved ? JSON.parse(saved) : INITIAL_STATS_DATA;
      return { ...INITIAL_STATS_DATA, ...parsed };
    } catch (e) { return INITIAL_STATS_DATA; }
  });

  const [budgets, setBudgets] = useState<Budgets>(() => {
    try {
      const saved = localStorage.getItem('yupao_budgets_v2');
      return saved ? JSON.parse(saved) : INITIAL_BUDGETS;
    } catch (e) { return INITIAL_BUDGETS; }
  });

  // [NEW] Storage Usage State
  const [storageUsage, setStorageUsage] = useState(0);

  useEffect(() => { localStorage.setItem('yupao_transactions_v2', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('yupao_stats_v2', JSON.stringify(initialStats)); }, [initialStats]);
  useEffect(() => { localStorage.setItem('yupao_budgets_v2', JSON.stringify(budgets)); }, [budgets]);
  useEffect(() => { localStorage.setItem('yupao_categories_v2', JSON.stringify(expenseCategories)); }, [expenseCategories]);

  // [NEW] Calculate Storage Usage on any data change
  useEffect(() => {
    const calculateStorage = () => {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                // UTF-16 characters are 2 bytes each
                total += ((localStorage[key].length + key.length) * 2);
            }
        }
        setStorageUsage(total);
    };
    calculateStorage();
  }, [transactions, budgets, initialStats, expenseCategories]);

  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: number | null }>({ show: false, id: null });
  const [resetModal, setResetModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthString());
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [newCategoryInput, setNewCategoryInput] = useState('');

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

  // Form State
  // [MODIFIED] Helper to determine default category
  const getDefaultCategory = () => {
      if (expenseCategories.includes('飲食')) return '飲食';
      return expenseCategories[0] || '一般';
  };

  const [formData, setFormData] = useState({
    date: getLocalDayString(),
    category: getDefaultCategory(), // [MODIFIED] Use helper
    amount: '',
    note: '',
    tag: 'need' as 'need' | 'want' | 'income', 
    type: 'expense' as 'income' | 'expense',
    isInstallment: false, 
    installmentCount: '3',  
    installmentCalcType: 'total' as 'total' | 'monthly', 
    perMonthInput: '',
    investSource: 'monthly' as 'monthly' | 'cumulative',
    fromSavings: false, 
    fromEmergency: false, 
    isAssetLiquidation: false, 
  });
    
  const [editingId, setEditingId] = useState<number | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (amountInputRef.current) {
        amountInputRef.current.scrollLeft = amountInputRef.current.scrollWidth;
    }
  }, [formData.amount]);

  // --- Export Logic ---
  const handleExport = () => {
    const csvRows = [];
    const { emergencyFund, emergencyGoal, cumulativeAddOnAvailable, monthlyRemainingInvestable, savings } = stats.investment;

    csvRows.push(`"=== 系統設定備份 (銜接用：當下實際數值) ==="`);
    csvRows.push(`"緊急預備金-初始金額", "${emergencyFund}"`);
    csvRows.push(`"緊急預備金-目標金額", "${emergencyGoal}"`);
    csvRows.push(`"初始資產配置-累積可加碼資金", "${cumulativeAddOnAvailable}"`);
    csvRows.push(`"初始資產配置-當月可投資金額", "${monthlyRemainingInvestable}"`);
    csvRows.push(`"初始資產配置-現金累積存款", "${savings}"`);
    csvRows.push("");

    const headers = ['ID', '日期', '類型', '分類', '金額', '標籤', '備註', '資金屬性', '分期ID'];
    csvRows.push(headers.join(','));

    transactions.forEach(t => {
        let typeLabel = t.type === 'income' ? '收入' : '支出';
        let specialLabel = '一般月收支';
        if (t.category === '投資') specialLabel = t.investSource === 'cumulative' ? '累積資金投資' : '當月額度投資';
        else if (t.fromSavings) specialLabel = '存款支付';
        else if (t.fromEmergency) specialLabel = '預備金支付';
        else if (t.isAssetLiquidation) specialLabel = '資產變現';

        const row = [
            t.id, t.date, typeLabel, t.category, t.amount, t.tag,
            `"${(t.note || '').replace(/"/g, '""')}"`, specialLabel, t.groupId || ''
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

  // --- Reset App Logic ---
  const handleResetApp = () => {
      localStorage.removeItem('yupao_transactions_v2');
      localStorage.removeItem('yupao_stats_v2');
      localStorage.removeItem('yupao_budgets_v2');
      localStorage.removeItem('yupao_categories_v2'); 
      window.location.reload();
  };

  // --- Calculator Logic ---
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

  // --- Core Calculation Logic ---
  const stats = useMemo(() => {
    let monthlyRawData: { [key: string]: MonthlyData } = {};
    
    availableMonths.forEach(m => {
        monthlyRawData[m] = { income: 0, assetLiquidation: 0, expense: 0, installmentExpense: 0, savingsExpense: 0, emergencyExpense: 0, actualInvested: 0, investedFromMonthly: 0, investedFromCumulative: 0, need: 0, want: 0, categoryMap: {} };
    });

    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7);
      if (!monthlyRawData[monthKey]) {
          monthlyRawData[monthKey] = { income: 0, assetLiquidation: 0, expense: 0, installmentExpense: 0, savingsExpense: 0, emergencyExpense: 0, actualInvested: 0, investedFromMonthly: 0, investedFromCumulative: 0, need: 0, want: 0, categoryMap: {} };
      }
      const amount = Number(t.amount);
      if (t.category === '收入') {
        if (t.isAssetLiquidation) monthlyRawData[monthKey].assetLiquidation += amount;
        else monthlyRawData[monthKey].income += amount;
      } else if (t.category === '投資') {
        monthlyRawData[monthKey].actualInvested += amount;
        if (t.investSource === 'cumulative') monthlyRawData[monthKey].investedFromCumulative += amount;
        else monthlyRawData[monthKey].investedFromMonthly += amount;
      } else {
        if (t.fromSavings) monthlyRawData[monthKey].savingsExpense += amount;
        else if (t.fromEmergency) monthlyRawData[monthKey].emergencyExpense += amount;
        else {
            monthlyRawData[monthKey].expense += amount;
            if (t.groupId) monthlyRawData[monthKey].installmentExpense += amount;
            if (t.tag === 'need') monthlyRawData[monthKey].need += amount;
            else if (t.tag === 'want') monthlyRawData[monthKey].want += amount;
        }
        if (t.category !== '投資') {
            if (!monthlyRawData[monthKey].categoryMap[t.category]) monthlyRawData[monthKey].categoryMap[t.category] = 0;
            monthlyRawData[monthKey].categoryMap[t.category] += amount;
        }
      }
    });

    const allRecordedMonths = Object.keys(monthlyRawData).sort();
    if (allRecordedMonths.length > 0) {
        const [minY, minM] = allRecordedMonths[0].split('-').map(Number);
        const [maxY, maxM] = allRecordedMonths[allRecordedMonths.length - 1].split('-').map(Number);
        let curY = minY, curM = minM;
        
        while (curY < maxY || (curY === maxY && curM <= maxM)) {
            const key = `${curY}-${String(curM).padStart(2, '0')}`;
            if (!monthlyRawData[key]) {
                monthlyRawData[key] = { income: 0, assetLiquidation: 0, expense: 0, installmentExpense: 0, savingsExpense: 0, emergencyExpense: 0, actualInvested: 0, investedFromMonthly: 0, investedFromCumulative: 0, need: 0, want: 0, categoryMap: {} };
            }
            curM++;
            if (curM > 12) { curM = 1; curY++; }
        }
    }

    const sortedMonthsAsc = Object.keys(monthlyRawData).sort(); 
    let cumulativeInvestable = initialStats.available; 
    let cumulativeSavings = initialStats.savings;
    let runningEmergencyFund = initialStats.emergencyCurrent || 0; 
    const emergencyGoal = initialStats.emergencyGoal;
    let carryOverBudget = initialStats.initialInvestable || 0; 
    let unfilledDeficit = 0;
    let processedMonthsData: { [key: string]: ProcessedMonthData } = {};

    sortedMonthsAsc.forEach(month => {
      const { income, assetLiquidation, expense, installmentExpense, savingsExpense, emergencyExpense, actualInvested, investedFromMonthly, investedFromCumulative, categoryMap, need, want } = monthlyRawData[month];
      const netIncome = income - expense; 
      let monthlyMaxInvestable = carryOverBudget; 
      let currentMonthCumulativeRemaining = cumulativeInvestable - investedFromCumulative;
      let currentMonthMonthlyRemaining = monthlyMaxInvestable - investedFromMonthly;
      cumulativeSavings = cumulativeSavings + assetLiquidation - savingsExpense;
      
      runningEmergencyFund -= emergencyExpense;

      let surplusForNextMonth = 0; 
      let currentMonthSavingsAddon = 0; 
      let deficitDeducted = 0;
      let repaidDeficit = 0;
      let divertedToEmergency = 0; 
        
      if (netIncome < 0) {
        const deficit = Math.abs(netIncome);
        deficitDeducted = deficit;
        currentMonthCumulativeRemaining -= deficit; 
        unfilledDeficit += deficit;
      } else {
        let availableSurplus = netIncome;
        if (unfilledDeficit > 0) {
              const repayAmount = Math.min(availableSurplus, unfilledDeficit);
              availableSurplus -= repayAmount;
              unfilledDeficit -= repayAmount;
              currentMonthCumulativeRemaining += repayAmount; 
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
        }
      }
      cumulativeSavings += currentMonthSavingsAddon;
      cumulativeInvestable = currentMonthCumulativeRemaining + currentMonthMonthlyRemaining;
      carryOverBudget = surplusForNextMonth;

      processedMonthsData[month] = {
          income, assetLiquidation, expense, installmentExpense, savingsExpense, emergencyExpense, netIncome, categoryMap,
          actualInvested, investedFromMonthly, investedFromCumulative, need, want, monthlyMaxInvestable,
          monthlyRemainingInvestable: currentMonthMonthlyRemaining, cumulativeAddOnAvailable: currentMonthCumulativeRemaining, 
          deficitDeducted, accumulatedDeficit: unfilledDeficit, savings: cumulativeSavings, emergencyFund: runningEmergencyFund,
          divertedToEmergency, repaidDeficit, capitalDivertedToEmergency: 0, emergencyGoal
      };
    });

    const currentData = processedMonthsData[selectedMonth] || {
        income: 0, assetLiquidation: 0, expense: 0, installmentExpense: 0, savingsExpense: 0, emergencyExpense: 0, netIncome: 0, categoryMap: {}, 
        actualInvested: 0, investedFromMonthly: 0, investedFromCumulative: 0, need: 0, want: 0,
        monthlyMaxInvestable: carryOverBudget, monthlyRemainingInvestable: carryOverBudget - 0, 
        cumulativeAddOnAvailable: cumulativeInvestable, deficitDeducted: 0, accumulatedDeficit: unfilledDeficit, savings: cumulativeSavings, 
        emergencyFund: runningEmergencyFund, divertedToEmergency: 0, repaidDeficit: 0, capitalDivertedToEmergency: 0, emergencyGoal: emergencyGoal
    };

    const pieData = Object.keys(currentData.categoryMap)
      .map(key => ({ name: key, value: currentData.categoryMap[key] }))
      .sort((a, b) => b.value - a.value);

    return { dashboard: { ...currentData, pieData }, investment: currentData };
  }, [transactions, initialStats, selectedMonth, availableMonths]);

  // --- Operations ---
  const openAddMode = () => {
    setEditingId(null);
    setFormData({ 
      date: getLocalDayString(), 
      category: getDefaultCategory(), // [MODIFIED] Prioritize '飲食'
      amount: '', note: '', tag: 'need', type: 'expense',
      isInstallment: false, installmentCount: '3', installmentCalcType: 'total', perMonthInput: '',
      investSource: 'monthly', fromSavings: false, fromEmergency: false, isAssetLiquidation: false,
    });
    setActiveTab('form');
  };

  const openEditMode = (trans: Transaction) => {
    if (swipedId === trans.id) return; 
    setEditingId(trans.id);
    const source = trans.category === '投資' ? (trans.tag === 'invest_cumulative' ? 'cumulative' : 'monthly') : 'monthly';
    setFormData({ 
      date: trans.date, category: trans.category, amount: trans.amount.toString(), 
      note: trans.note.replace(/\(\d+\/\d+\)$/, '').trim(), tag: trans.tag as any, type: trans.type,
      isInstallment: false, installmentCount: '3', installmentCalcType: 'total', perMonthInput: '',
      investSource: source, fromSavings: trans.fromSavings || false, fromEmergency: trans.fromEmergency || false, isAssetLiquidation: trans.isAssetLiquidation || false,
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
    if (formData.category === '收入') finalTag = 'income';
    else if (formData.category === '投資') finalTag = formData.investSource === 'cumulative' ? 'invest_cumulative' : 'invest_monthly';

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

                  if (t.id === editingId) {
                      return {
                          ...t, date: newDate, category: formData.category,
                          amount: Number(finalAmount), tag: finalTag, 
                          note: formData.note, 
                          fromSavings: formData.fromSavings, fromEmergency: formData.fromEmergency, isAssetLiquidation: formData.isAssetLiquidation,
                      };
                  } else {
                      return {
                          ...t, 
                          date: newDate, 
                          category: formData.category,
                          tag: finalTag,
                          fromSavings: formData.fromSavings,
                          fromEmergency: formData.fromEmergency,
                          isAssetLiquidation: formData.isAssetLiquidation,
                      };
                  }
              }
              return t;
          });
          setTransactions(updatedTransactions);
      } else {
          setTransactions(transactions.map(t => t.id === editingId ? { ...t, ...formData, tag: finalTag, amount: Number(finalAmount), fromSavings: formData.fromSavings, fromEmergency: formData.fromEmergency, isAssetLiquidation: formData.isAssetLiquidation } : t));
      }
      setActiveTab('history');
      return;
    } 
    
    const baseId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
    const totalAmount = Number(finalAmount);
    const shouldInstallment = !formData.fromSavings && !formData.fromEmergency && !formData.isAssetLiquidation && formData.isInstallment && formData.type === 'expense' && formData.category !== '投資' && Number(formData.installmentCount) > 1;

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
            id: baseId + i, ...formData, date: formatDateToLocal(nextDate), amount: currentAmount,
            note: `${formData.note} (${i + 1}/${count})`, groupId: groupId, tag: finalTag, fromSavings: false, fromEmergency: false, isAssetLiquidation: false,
          });
       }
       setTransactions([...newTransactions, ...transactions]);
    } else {
       const item: Transaction = { id: baseId, ...formData, tag: finalTag, amount: totalAmount };
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

  // --- Views ---
  const renderDashboardView = () => {
    const { emergencyFund, emergencyGoal, installmentExpense, income } = stats.dashboard;
    const emergencyProgress = emergencyGoal > 0 ? Math.min((emergencyFund / emergencyGoal) * 100, 100) : 0;
    const isEmergencyFull = emergencyGoal > 0 && emergencyFund >= emergencyGoal;
    const installmentRatio = income > 0 ? (installmentExpense / income) * 100 : 0;

    const cardTitleStyle = "text-[15px] font-bold text-gray-900 mb-1"; 
    const cardSubLabelStyle = "text-[11px] font-bold text-gray-400 uppercase tracking-wider";
    const cardContainerStyle = "px-5 py-3.5"; 
    const mainMetricStyle = "text-2xl font-bold tracking-tight";
    const splitMetricStyle = "text-2xl font-bold tracking-tight";

    return (
      <div className="space-y-4 pb-4 pt-2">
        <div className="flex justify-start items-center px-1">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white text-black font-bold text-sm rounded-full px-4 py-2 border border-gray-200 outline-none shadow-sm appearance-none pr-8 relative z-10"
              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}>
              {availableMonths.map(m => ( <option key={m} value={m}>{m}</option> ))}
            </select>
        </div>

        <div className="p-5 rounded-[24px] text-white relative overflow-hidden shadow-xl" style={{ backgroundColor: THEME.darkBg }}>
           <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                 <div>
                    <h2 className="text-sm font-bold opacity-90 mb-1">緊急預備金</h2>
                    <div className="flex items-baseline gap-2">
                        <span className={`${mainMetricStyle} text-white`}>${formatMoney(Math.floor(emergencyFund))}</span>
                        {emergencyGoal > 0 ? <span className="text-xs opacity-50 font-medium">/ ${formatMoney(emergencyGoal)}</span> : <button onClick={() => setActiveTab('settings')} className="text-[10px] font-bold text-[#F6AD55] bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition ml-2">請設定目標</button>}
                    </div>
                 </div>
                 {emergencyGoal > 0 && (isEmergencyFull ? <div className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 text-white"><CheckCircle className="w-3 h-3" /> 已達標</div> : <div className="bg-orange-500/20 text-orange-400 border border-orange-500/30 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold animate-pulse">補水中</div>)}
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mb-1.5 overflow-hidden">
                 <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${emergencyProgress}%`, backgroundColor: isEmergencyFull ? THEME.success : '#F6AD55' }}></div>
              </div>
              <p className="text-[10px] opacity-60 text-right">{isEmergencyFull ? '資金充裕' : '優先級：所有閒置資金 > 緊急預備金'}</p>
           </div>
        </div>

        <CardContainer className={`${cardContainerStyle} flex justify-between items-center relative overflow-hidden`}>
           <div className="relative z-10">
            <h3 className={cardTitleStyle}>本月淨收支</h3>
            <p className={`${mainMetricStyle} ${stats.dashboard.netIncome >= 0 ? 'text-gray-900' : 'text-[#F56565]'}`}>
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
              <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">佔月收入 {installmentRatio.toFixed(1)}%</span>
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
             <div className="h-full bg-black transition-all duration-1000 ease-out" style={{ width: `${stats.dashboard.expense > 0 ? (stats.dashboard.need / stats.dashboard.expense * 100) : 0}%` }}></div>
             <div className="h-full bg-[#C59D5F] transition-all duration-1000 ease-out" style={{ width: `${stats.dashboard.expense > 0 ? (stats.dashboard.want / stats.dashboard.expense * 100) : 0}%` }}></div>
           </div>

           <div className="flex justify-between items-end">
              <div 
                className="flex flex-col gap-0.5 cursor-pointer active:opacity-70 transition-opacity"
                onClick={() => { setFilterTag('need'); setActiveTab('history'); }}
              >
                 <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-black"></div>
                    <span className={cardSubLabelStyle}>Need (需要)</span>
                 </div>
                 <div className="flex items-baseline gap-1.5">
                    <span className={`${splitMetricStyle} text-gray-900`}>${formatMoney(stats.dashboard.need)}</span>
                    <span className="text-[10px] font-medium text-gray-400">
                        {stats.dashboard.expense > 0 ? ((stats.dashboard.need / stats.dashboard.expense) * 100).toFixed(0) : 0}%
                    </span>
                 </div>
              </div>

              <div 
                className="flex flex-col gap-0.5 items-end cursor-pointer active:opacity-70 transition-opacity"
                onClick={() => { setFilterTag('want'); setActiveTab('history'); }}
              >
                 <div className="flex items-center gap-1.5">
                    <span className={cardSubLabelStyle}>Want (想要)</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C59D5F]"></div>
                 </div>
                 <div className="flex items-baseline gap-1.5 justify-end">
                    <span className={`${splitMetricStyle} text-[#C59D5F]`}>${formatMoney(stats.dashboard.want)}</span>
                    <span className="text-[10px] font-medium text-gray-400">
                        {stats.dashboard.expense > 0 ? ((stats.dashboard.want / stats.dashboard.expense) * 100).toFixed(0) : 0}%
                    </span>
                 </div>
              </div>
           </div>
        </CardContainer>

        <CardContainer className={cardContainerStyle}>
          <div className="flex justify-between items-center mb-4">
              <h3 className={cardTitleStyle}>預算執行狀況</h3>
              <button onClick={() => setActiveTab('settings')} className="text-[10px] font-bold text-black bg-gray-100 px-2.5 py-1 rounded-md hover:bg-gray-200 transition">編輯</button>
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
                        <span className="text-gray-500 font-medium text-[10px]">
                            <span className={isOver ? 'text-red-500 font-bold' : 'text-black'}>${formatMoney(spent)}</span> <span className="text-gray-300 mx-1">/</span> ${formatMoney(budget as number)}
                        </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-[#FF3B30]' : 'bg-black'}`} style={{ width: `${percent}%` }}></div>
                    </div>
                </div>
                );
            })}
            {Object.values(budgets).every(b => b === 0) && <p className="text-xs text-gray-400 text-center py-1">尚未設定預算</p>}
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
                            <span className="text-[10px] text-gray-400 font-medium w-8 text-right tabular-nums">{stats.dashboard.expense > 0 ? ((entry.value / stats.dashboard.expense) * 100).toFixed(0) : 0}%</span>
                        </div>
                    </div>
                    ))}
                </div>
            </>
          ) : <div className="h-32 flex items-center justify-center text-gray-400 text-xs">尚無支出紀錄</div>}
        </CardContainer>
      </div>
    );
  }
  
  const renderFormView = () => {
    const { monthlyRemainingInvestable, cumulativeAddOnAvailable, savings, emergencyFund } = stats.investment;
    let effectiveMonthlyLimit = monthlyRemainingInvestable;
    let effectiveCumulativeLimit = cumulativeAddOnAvailable;

    if (editingId) {
        const originalTrans = transactions.find(t => t.id === editingId);
        if (originalTrans && originalTrans.category === '投資') {
            if (originalTrans.investSource === 'monthly') effectiveMonthlyLimit += originalTrans.amount;
            else if (originalTrans.investSource === 'cumulative') effectiveCumulativeLimit += originalTrans.amount;
        }
    }
    const currentSavings = savings;
    const currentEmergency = emergencyFund;
    const isSavingsInsufficient = formData.fromSavings && (Number(formData.amount) > currentSavings);
    const isEmergencyInsufficient = formData.fromEmergency && (Number(formData.amount) > currentEmergency);
    
    let isInvestmentInsufficient = false;
    if (formData.type === 'expense' && formData.category === '投資') {
        const amount = Number(formData.amount);
        if (formData.investSource === 'monthly' && amount > effectiveMonthlyLimit) isInvestmentInsufficient = true;
        else if (formData.investSource === 'cumulative' && amount > effectiveCumulativeLimit) isInvestmentInsufficient = true;
    }
    const isSubmitDisabled = isSavingsInsufficient || isEmergencyInsufficient || isInvestmentInsufficient;

    return (
        <div className="space-y-5 pb-20 pt-2">
        <div className="flex items-center justify-between px-1 mb-2">
            <button onClick={() => setActiveTab('dashboard')} className="flex items-center text-gray-500 font-medium -ml-2 p-2 hover:bg-gray-100 rounded-lg transition"><ChevronLeft className="w-5 h-5" /> 返回</button>
            <div className="w-10"></div>
        </div>
        <div className="bg-gray-200/60 p-1.5 rounded-xl flex relative">
            <div className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white rounded-[10px] shadow-sm transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${formData.type === 'expense' ? 'left-1.5' : 'left-[calc(50%+1.5px)]'}`}></div>
            <button onClick={() => setFormData({...formData, type: 'expense', category: '飲食', tag: 'need', investSource: 'monthly', isAssetLiquidation: false})} className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors ${formData.type === 'expense' ? 'text-gray-900' : 'text-gray-500'}`}>支出</button>
            <button onClick={() => setFormData({...formData, type: 'income', category: '收入', tag: 'income', investSource: 'monthly', fromSavings: false, fromEmergency: false})} className={`flex-1 py-2 text-sm font-bold relative z-10 transition-colors ${formData.type === 'income' ? 'text-gray-900' : 'text-gray-500'}`}>收入</button>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
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
                    <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} 
                        className="text-base font-medium text-gray-600 bg-transparent outline-none text-right appearance-none pr-6 relative z-10"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e")`, backgroundPosition: 'right center', backgroundRepeat: 'no-repeat', backgroundSize: '1em 1em' }}>
                        {formData.type === 'income' ? <option value="收入">收入</option> : <>{expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}<option value="投資">投資</option></>}
                    </select>
                </div>
            </div>
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
            {formData.type === 'expense' && formData.category === '投資' ? (
                <div className="p-5">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">資金來源</p>
                    <div className="space-y-4">
                        <div onClick={() => setFormData({...formData, investSource: 'monthly'})} className={`flex items-center justify-between cursor-pointer group p-2 rounded-lg transition-colors ${formData.investSource === 'monthly' ? 'bg-blue-50/50' : ''}`}>
                            <div className="flex flex-col"><span className="text-base font-medium text-gray-900">當月可投資金額</span><span className={`text-[11px] font-bold mt-0.5 ${effectiveMonthlyLimit < 0 ? 'text-red-400' : 'text-blue-500'}`}>餘額: ${formatMoney(effectiveMonthlyLimit)}</span></div>
                            <div className="relative flex items-center"><input type="radio" name="investSource" checked={formData.investSource === 'monthly'} onChange={() => setFormData({...formData, investSource: 'monthly'})} className="w-5 h-5 text-black accent-black" /></div>
                        </div>
                        <div className="h-px bg-gray-50 w-full ml-4"></div>
                        <div onClick={() => setFormData({...formData, investSource: 'cumulative'})} className={`flex items-center justify-between cursor-pointer group p-2 rounded-lg transition-colors ${formData.investSource === 'cumulative' ? 'bg-orange-50/50' : ''}`}>
                             <div className="flex flex-col"><span className="text-base font-medium text-black">歷史累積可加碼資金</span><span className={`text-[11px] font-bold mt-0.5 ${effectiveCumulativeLimit < 0 ? 'text-red-400' : 'text-[#C59D5F]'}`}>餘額: ${formatMoney(effectiveCumulativeLimit)}</span></div>
                            <input type="radio" name="investSource" checked={formData.investSource === 'cumulative'} onChange={() => setFormData({...formData, investSource: 'cumulative'})} className="w-5 h-5 text-black accent-black" />
                        </div>
                    </div>
                    {isInvestmentInsufficient && <div className="flex items-center gap-2 px-2 mt-4 text-[#E53E3E] animate-pulse"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">投資額度不足，請調整金額或來源</span></div>}
                </div>
            ) : formData.type === 'expense' ? (
                <div className="p-4 flex flex-col gap-4">
                    <div className="flex gap-3">
                        <button onClick={() => setFormData({...formData, tag: 'need'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'need' ? 'bg-gray-100 text-black border-gray-200' : 'bg-white text-gray-400 border-gray-200'}`}>需要 (Need)</button>
                        <button onClick={() => setFormData({...formData, tag: 'want'})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition border ${formData.tag === 'want' ? 'bg-[#FDF2F8] text-[#D53F8C] border-[#FBCFE8]' : 'bg-white text-gray-400 border-gray-200'}`}>想要 (Want)</button>
                    </div>
                    {/* Savings Option */}
                    <div onClick={() => setFormData({...formData, fromSavings: !formData.fromSavings, fromEmergency: false, isInstallment: false})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.fromSavings ? 'bg-[#FEEBC8] border-[#FBD38D]' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.fromSavings ? 'bg-[#F6AD55] text-white' : 'bg-gray-100 text-gray-400'}`}><PiggyBank className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.fromSavings ? 'text-[#975A16]' : 'text-gray-500'}`}>使用現金存款支付</span>{formData.fromSavings && <span className="text-[10px] text-[#C05621] font-medium">餘額: ${formatMoney(currentSavings)}</span>}</div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.fromSavings ? 'bg-[#975A16] border-[#975A16]' : 'border-gray-300'}`}>{formData.fromSavings && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {isSavingsInsufficient && <div className="flex items-center gap-2 px-2 text-[#E53E3E]"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">存款餘額不足</span></div>}

                    {/* Emergency Fund Option */}
                    <div onClick={() => setFormData({...formData, fromEmergency: !formData.fromEmergency, fromSavings: false, isInstallment: false})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.fromEmergency ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.fromEmergency ? 'bg-[#FF3B30] text-white' : 'bg-gray-100 text-gray-400'}`}><ShieldAlert className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.fromEmergency ? 'text-[#C53030]' : 'text-gray-500'}`}>使用緊急預備金支付</span>{formData.fromEmergency && <span className="text-[10px] text-[#C53030] font-medium">餘額: ${formatMoney(currentEmergency)}</span>}</div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.fromEmergency ? 'bg-[#FF3B30] border-[#FF3B30]' : 'border-gray-300'}`}>{formData.fromEmergency && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    {isEmergencyInsufficient && <div className="flex items-center gap-2 px-2 text-[#E53E3E]"><AlertCircle className="w-4 h-4" /><span className="text-xs font-bold">預備金餘額不足</span></div>}
                </div>
            ) : (
                <div className="p-4">
                    <div onClick={() => setFormData({...formData, isAssetLiquidation: !formData.isAssetLiquidation})} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${formData.isAssetLiquidation ? 'bg-[#E6FFFA] border-[#81E6D9]' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${formData.isAssetLiquidation ? 'bg-[#38B2AC] text-white' : 'bg-gray-100 text-gray-400'}`}><RefreshCcw className="w-4 h-4" /></div>
                            <div className="flex flex-col"><span className={`text-sm font-bold ${formData.isAssetLiquidation ? 'text-[#2C7A7B]' : 'text-gray-500'}`}>資產調整 / 變現</span><span className="text-[10px] text-gray-400">存入現金存款，不計入投資額度</span></div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.isAssetLiquidation ? 'bg-[#38B2AC] border-[#38B2AC]' : 'border-gray-300'}`}>{formData.isAssetLiquidation && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                </div>
            )}
        </div>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 p-5">
            <input type="text" placeholder="新增備註..." value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full text-base bg-transparent outline-none placeholder-gray-400" />
        </div>
        {formData.type === 'expense' && formData.category !== '投資' && !editingId && !formData.fromSavings && !formData.fromEmergency && (
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-black"><CreditCard className="w-5 h-5" /></div><span className="text-base font-bold text-gray-900">分期付款自動生成</span></div>
                    <div onClick={() => setFormData({...formData, isInstallment: !formData.isInstallment})} className={`w-12 h-7 rounded-full p-1 cursor-pointer transition-colors duration-300 ease-in-out ${formData.isInstallment ? 'bg-[#34C759]' : 'bg-gray-200'}`}><div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${formData.isInstallment ? 'translate-x-5' : 'translate-x-0'}`}></div></div>
                </div>
                {formData.isInstallment && (
                    <div className="mt-5 pt-5 border-t border-gray-50 space-y-4 animate-slide-down">
                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button onClick={() => setFormData({...formData, installmentCalcType: 'total'})} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'total' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>輸入總額 (算每期)</button>
                            <button onClick={() => setFormData({...formData, installmentCalcType: 'monthly'})} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${formData.installmentCalcType === 'monthly' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}>輸入每期 (算總額)</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">期數 (月)</label>
                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={formData.installmentCount} onChange={e => { const val = e.target.value; if (val === '' || /^\d+$/.test(val)) setFormData({ ...formData, installmentCount: val, amount: formData.installmentCalcType === 'monthly' && formData.perMonthInput && val ? String(Number(formData.perMonthInput) * Number(val)) : formData.amount }); }} className="w-full bg-gray-50 rounded-xl p-3 text-center font-bold text-black border border-gray-100 focus:border-black outline-none" />
                            </div>
                            <div><label className="text-xs font-bold text-gray-400 uppercase tracking-wide block mb-2">每期金額</label>
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
            <button onClick={handleSave} disabled={isSubmitDisabled} className={`flex-[2] py-3.5 rounded-xl font-bold shadow-lg transition flex items-center justify-center gap-2 ${isSubmitDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-black text-white hover:bg-gray-900'}`}>{isSubmitDisabled ? <Lock className="w-5 h-5" /> : <Save className="w-5 h-5" />} {editingId ? '儲存變更' : '新增紀錄'}</button>
        </div>
        </div>
    );
  };

  const renderHistoryView = () => {
    const sorted = transactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

    return (
      <div className="space-y-6 pb-4 pt-2">
        <div className="flex justify-between items-center px-1">
          <div>
            <h2 className="text-3xl font-extrabold text-black tracking-tight">歷史紀錄</h2>
            <p className="text-xs font-semibold text-gray-400 mt-1">{filtered.length} 筆紀錄 {hideFuture && '(已隱藏未到期)'}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFilterTag(filterTag === 'want' ? null : 'want')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition border ${filterTag === 'want' ? 'bg-[#D53F8C] text-white border-[#D53F8C]' : 'bg-white text-[#D53F8C] border-gray-200 hover:bg-[#FFF5F7]'}`}>
                {filterTag === 'want' ? <Heart className="w-3.5 h-3.5 fill-current" /> : <Heart className="w-3.5 h-3.5" />}
                Want
            </button>
            <button onClick={() => setFilterTag(filterTag === 'need' ? null : 'need')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition border ${filterTag === 'need' ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:bg-gray-50'}`}>
                {filterTag === 'need' ? <ShoppingBag className="w-3.5 h-3.5 fill-current" /> : <ShoppingBag className="w-3.5 h-3.5" />}
                Need
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
                    <div className={`rounded-xl p-2 pl-3 flex items-center gap-2 border animate-fade-in ${filterTag === 'want' ? 'bg-[#FFF5F7] border-[#FBCFE8]' : 'bg-gray-100 border-gray-200'}`}>
                        <span className={`text-xs font-bold ${filterTag === 'want' ? 'text-[#D53F8C]' : 'text-gray-500'}`}>標籤:</span>
                        <span className={`text-sm font-bold ${filterTag === 'want' ? 'text-[#D53F8C]' : 'text-black'}`}>{filterTag === 'want' ? '想要 (Want)' : '需要 (Need)'}</span>
                        <button onClick={() => setFilterTag(null)} className="w-5 h-5 rounded-full bg-white/50 text-gray-500 flex items-center justify-center hover:text-black"><X className="w-3 h-3" /></button>
                    </div>
                )}
            </div>
        )}

        {Object.entries(groupedTransactions).map(([groupName, groupItems]) => (
          <div key={groupName}>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-1">{groupName}</h4>
            <div className="bg-white rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 divide-y divide-gray-50">
              {(groupItems as Transaction[]).map(t => (
                <div key={t.id} className="relative overflow-hidden" onTouchStart={(e) => handleTouchStart(e, t.id)} onTouchMove={(e) => handleTouchMove(e, t.id)} onTouchEnd={handleTouchEnd}>
                    <div className="absolute inset-y-0 right-0 w-24 bg-[#FF3B30] flex items-center justify-center z-0" onClick={(e) => requestDelete(e, t.id)}><Trash2 className="w-6 h-6 text-white" /></div>
                    <div onClick={() => openEditMode(t)} className={`p-4 flex justify-between items-center bg-white relative z-10 transition-transform duration-300 ease-out ${swipedId === t.id ? '-translate-x-24' : 'translate-x-0'} active:bg-gray-50`}>
                        <div className="flex items-center gap-4 overflow-hidden">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-green-50 text-[#34C759]' : t.category === '投資' ? 'bg-gray-100 text-black' : 'bg-gray-100 text-gray-500'}`}>{t.category === '投資' ? <TrendingUp className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}</div>
                            <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-bold text-gray-900 text-base truncate">{t.category}</p>{t.groupId && <span className="bg-gray-100 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-md">分期</span>}{t.fromSavings && <span className="bg-[#FEEBC8] text-[#975A16] text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><PiggyBank className="w-2.5 h-2.5" /> 存款</span>}{t.fromEmergency && <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><ShieldAlert className="w-2.5 h-2.5" /> 預備金</span>}{t.isAssetLiquidation && <span className="bg-[#E6FFFA] text-[#2C7A7B] text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5"><RefreshCcw className="w-2.5 h-2.5" /> 變現</span>}</div><p className="text-xs text-gray-400 truncate mt-0.5">{t.date} • {t.note || '無備註'}</p></div>
                        </div>
                        <div className="text-right"><p className={`font-bold text-base ${t.type === 'income' ? 'text-[#34C759]' : 'text-black'}`}>{t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}</p>{t.category !== '投資' && t.type === 'expense' && (<span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${t.tag === 'need' ? 'bg-gray-100 text-gray-500' : 'bg-[#FFF5F7] text-[#D53F8C]'}`}>{t.tag === 'need' ? '需要' : '想要'}</span>)}</div>
                    </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {transactions.length === 0 && <div className="text-center py-20 text-gray-400"><p>尚無交易紀錄</p></div>}
      </div>
    );
  };

  const renderInvestmentView = () => (
    <div className="relative pt-2">
       <div className="p-7 rounded-[28px] text-white shadow-2xl relative overflow-hidden mb-6" style={{ backgroundColor: THEME.darkBg }}>
        <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] bg-white/5 blur-[60px] rounded-full pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8"><div><h1 className="text-3xl font-bold tracking-tight">臨界財富</h1><p className="text-[11px] font-medium text-gray-400 mt-1">累積資產，直達臨界點</p></div><span className="text-xs font-bold bg-white/10 px-3 py-1 rounded-lg text-gray-300 backdrop-blur-md border border-white/5">{selectedMonth}</span></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl backdrop-blur-sm border border-white/5" style={{ backgroundColor: THEME.darkCard }}><div className="flex items-center gap-1.5 mb-2"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">本月可投資金額</p><Info className="w-3 h-3 text-gray-500 cursor-help" /></div><p className="text-2xl font-bold" style={{ color: THEME.textBlue }}>${formatMoney(stats.investment.monthlyMaxInvestable)}</p>{stats.investment.divertedToEmergency > 0 && (<p className="text-[9px] text-[#F6AD55] mt-1 opacity-80">(月餘額扣除 ${formatMoney(stats.investment.divertedToEmergency)} 至預備金)</p>)}{stats.investment.repaidDeficit > 0 && (<p className="text-[9px] text-red-300 mt-1 opacity-80">(月餘額優先填補赤字 ${formatMoney(stats.investment.repaidDeficit)})</p>)}</div>
            <div className="p-4 rounded-2xl backdrop-blur-sm border border-white/5" style={{ backgroundColor: THEME.darkCard }}><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">實際投入金額</p><p className="text-2xl font-bold" style={{ color: THEME.textGreen }}>${formatMoney(stats.investment.actualInvested)}</p></div>
          </div>
          <div className="mt-4"><div className={`p-5 rounded-2xl backdrop-blur-md border ${stats.investment.monthlyRemainingInvestable < 0 ? 'border-red-500/30 bg-red-500/10' : 'border-white/5'}`} style={{ backgroundColor: stats.investment.monthlyRemainingInvestable < 0 ? undefined : THEME.darkCard }}><div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-300">本月加碼資金</span><span className={`text-2xl font-bold ${stats.investment.monthlyRemainingInvestable < 0 ? 'text-red-400' : ''}`} style={{ color: stats.investment.monthlyRemainingInvestable >= 0 ? THEME.textYellow : undefined }}>${formatMoney(stats.investment.monthlyRemainingInvestable)}</span></div><p className="text-[9px] text-gray-500 text-right mt-1">公式：新增額度 - 本月實際投入</p></div></div>
          <div className="mt-6 pt-4 border-t border-white/10 flex flex-col gap-2">
             <div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-400">歷史累積可加碼資金</span><span className="text-xl font-bold text-gray-200">${formatMoney(stats.investment.cumulativeAddOnAvailable)}</span></div>
             {stats.investment.capitalDivertedToEmergency > 0 && (<div className="flex justify-between items-center bg-orange-500/10 px-2 py-1 rounded"><span className="text-[10px] text-orange-400">已優先轉移至緊急預備金</span><span className="text-xs font-bold text-orange-400">-${formatMoney(stats.investment.capitalDivertedToEmergency)}</span></div>)}
             {stats.investment.accumulatedDeficit > 0 && (<div className="flex justify-between items-center bg-red-500/10 px-2 py-1 rounded"><span className="text-[10px] text-red-400">尚未填補之歷史赤字</span><span className="text-xs font-bold text-red-400">-${formatMoney(stats.investment.accumulatedDeficit)}</span></div>)}
          </div>
        </div>
      </div>
      <div className="p-5 rounded-2xl shadow-sm border border-[#FEEBC8]" style={{ backgroundColor: THEME.creamBg }}>
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 text-[#975A16]"><LinkIcon className="w-4 h-4" /><p className="text-xs font-bold uppercase tracking-wider">現金累積存款 (10% 儲蓄)</p></div>{stats.investment.savingsExpense > 0 && (<span className="text-[10px] font-bold text-[#C05621] bg-[#FEEBC8] px-2 py-0.5 rounded-full border border-[#FBD38D]">本月支出 -${formatMoney(stats.investment.savingsExpense)}</span>)}</div>
        <div className="flex items-center justify-between bg-white/60 p-3 rounded-xl"><span className="text-sm font-semibold text-gray-600">目前累積</span><span className="text-2xl font-bold" style={{ color: THEME.textBrown }}>${formatMoney(stats.investment.savings)}</span></div>
        {stats.investment.assetLiquidation > 0 && (<div className="mt-2 text-right"><span className="text-[10px] text-[#2C7A7B] bg-[#E6FFFA] px-2 py-0.5 rounded-full border border-[#81E6D9]">+{formatMoney(stats.investment.assetLiquidation)} 資產變現入帳</span></div>)}
      </div>
    </div>
  );

  const renderSettingsView = () => {
    const handleStatChange = (field: keyof StatsData, value: string) => { if (/^\d*$/.test(value)) setInitialStats(prev => ({...prev, [field]: value === '' ? 0 : Number(value)})); };
    
    // Storage Calculation for UI
    const limit = 5 * 1024 * 1024; // 5MB approx limit
    const usagePercent = Math.min((storageUsage / limit) * 100, 100);
    const usageColor = usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-orange-500' : 'bg-[#34C759]';

    return (
        <div className="space-y-6 pt-2">
        <div className="flex items-end justify-between px-1 mb-2"><h2 className="text-3xl font-extrabold text-black tracking-tight">設定</h2></div>
        
        {/* [NEW] 分類管理區塊 */}
        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">分類管理</h4>
            <CardContainer className="p-4">
                <div className="flex flex-wrap gap-2 mb-4">
                    {expenseCategories.map(cat => (
                        <div key={cat} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full">
                            <span className="text-sm font-bold text-gray-700">{cat}</span>
                            <button onClick={() => handleRemoveCategory(cat)} className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition">
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input type="text" placeholder="輸入新分類名稱..." value={newCategoryInput} onChange={e => setNewCategoryInput(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium outline-none focus:border-black transition" />
                    <button onClick={handleAddCategory} disabled={!newCategoryInput.trim()} className="bg-black text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
                        <Plus className="w-4 h-4" /> 新增
                    </button>
                </div>
            </CardContainer>
        </div>

        <div><h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">緊急預備金</h4><CardContainer className="divide-y divide-gray-50"><div className="p-4 flex items-center justify-between"><label className="text-base font-medium text-black">初始金額</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" className="text-base font-medium text-right outline-none text-black w-32" value={initialStats.emergencyCurrent || ''} onChange={e => handleStatChange('emergencyCurrent', e.target.value)} /></div><div className="p-4 flex items-center justify-between"><label className="text-base font-medium text-black">目標金額</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" className="text-base font-medium text-right outline-none text-black w-32" value={initialStats.emergencyGoal || ''} onChange={e => handleStatChange('emergencyGoal', e.target.value)} /></div></CardContainer><p className="text-xs text-gray-400 mt-2 ml-2">建議設定為 3~6 個月的生活開銷</p></div>
        <div><h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">初始資產配置</h4><CardContainer className="divide-y divide-gray-50"><div className="p-4 flex items-center justify-between"><label className="text-base font-medium text-gray-900">累積可加碼資金</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" className="text-base font-medium text-right outline-none text-black w-32" value={initialStats.available || ''} onChange={e => handleStatChange('available', e.target.value)} /></div><div className="p-4 flex items-center justify-between"><label className="text-base font-medium text-gray-900">當月可投資金額</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" className="text-base font-medium text-right outline-none text-black w-32" value={initialStats.initialInvestable || ''} onChange={e => handleStatChange('initialInvestable', e.target.value)} /></div><div className="p-4 flex items-center justify-between"><label className="text-base font-medium text-gray-900">現金累積存款</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" className="text-base font-medium text-right outline-none text-black w-32" value={initialStats.savings || ''} onChange={e => handleStatChange('savings', e.target.value)} /></div></CardContainer></div>
        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">每月預算設定</h4>
            <CardContainer className="divide-y divide-gray-50">
                {expenseCategories.map(cat => (
                    <div key={cat} className="p-4 flex items-center justify-between"><label className="text-base font-medium text-gray-900 w-24">{cat}</label><input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="未設定" className="text-base font-medium text-right outline-none text-black flex-1" value={budgets[cat] || ''} onChange={(e) => { if (/^\d*$/.test(e.target.value)) updateBudget(cat, e.target.value); }} /></div>
                ))}
            </CardContainer>
        </div>
        
        {/* [NEW] 資料管理區塊 (含儲存空間顯示) */}
        <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 ml-2">資料管理</h4>
            
            <CardContainer className="p-4 mb-2">
                 <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2 text-gray-900">
                        <Database className="w-4 h-4" />
                        <span className="text-sm font-bold">儲存空間</span>
                     </div>
                     <span className="text-xs font-medium text-gray-500">{(storageUsage / 1024).toFixed(1)} KB / ~5 MB</span>
                 </div>
                 <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                     <div className={`h-full rounded-full transition-all duration-500 ${usageColor}`} style={{ width: `${usagePercent}%` }}></div>
                 </div>
                 <p className="text-[10px] text-gray-400 mt-2 text-right">瀏覽器限制約 5MB，請定期備份以免資料遺失。</p>
            </CardContainer>

            <div onClick={handleExport} className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center justify-center gap-2 cursor-pointer active:bg-gray-50 transition-colors"><Download className="w-5 h-5 text-black" /><span className="text-base font-bold text-black">匯出交易紀錄 (Excel/CSV)</span></div>
        </div>

        <div className="pt-6"><h4 className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2 ml-2">危險區域</h4><div onClick={() => setResetModal(true)} className="bg-red-50 rounded-2xl p-4 border border-red-100 flex items-center justify-center gap-2 cursor-pointer active:bg-red-100 transition-colors"><AlertTriangle className="w-5 h-5 text-red-500" /><span className="text-base font-bold text-red-600">初始化 App (清空所有資料)</span></div><p className="text-[10px] text-gray-400 mt-2 text-center">如果儲存空間滿了或發生錯誤，可使用此功能重置。</p></div>
        <div className="py-4 text-center"><p className="text-xs font-medium text-gray-300">臨界財富 v8.6</p></div>
        </div>
    );
  };

  const needsScrolling = activeTab === 'dashboard' || activeTab === 'history' || activeTab === 'form' || activeTab === 'settings' || activeTab === 'investment';
  const scrollContainerClasses = `flex-1 relative p-5 pt-[calc(env(safe-area-inset-top)+20px)] ${needsScrolling ? 'overflow-y-auto hide-scrollbar pb-24' : 'overflow-hidden'}`;

  return (
    <>
      <style>{`body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; } .hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } } .animation-slide-up { animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; } .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; } * { -webkit-tap-highlight-color: transparent; }`}</style>
      <div className="fixed inset-0 w-full h-[100dvh] bg-[#F8F9FA] flex justify-center items-center overflow-hidden">
        <div className="w-full max-w-md h-full bg-[#F8F9FA] flex flex-col relative shadow-2xl overflow-hidden select-none touch-manipulation overscroll-none" ref={scrollRef}>
           {deleteModal.show && (<div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/20 backdrop-blur-sm animation-fade-in"><div className="bg-white/90 backdrop-blur-xl rounded-[14px] shadow-2xl w-full max-w-[270px] text-center overflow-hidden transform scale-100 transition-all"><div className="p-5"><h3 className="text-[17px] font-bold text-black mb-1">刪除紀錄？</h3><p className="text-[13px] text-gray-500">此動作無法復原。</p></div><div className="flex border-t border-gray-300/50"><button onClick={() => setDeleteModal({ show: false, id: null })} className="flex-1 py-3 text-[17px] text-black font-normal border-r border-gray-300/50 active:bg-gray-100">取消</button><button onClick={confirmDelete} className="flex-1 py-3 text-[17px] text-[#FF3B30] font-bold active:bg-gray-100">刪除</button></div></div></div>)}
           {resetModal && (<div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-black/40 backdrop-blur-sm animation-fade-in"><div className="bg-white/90 backdrop-blur-xl rounded-[14px] shadow-2xl w-full max-w-[270px] text-center overflow-hidden transform scale-100 transition-all"><div className="p-5"><AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" /><h3 className="text-[17px] font-bold text-black mb-1">確認初始化？</h3><p className="text-[13px] text-gray-500">所有交易紀錄與設定將被永久刪除且無法復原。</p></div><div className="flex border-t border-gray-300/50"><button onClick={() => setResetModal(false)} className="flex-1 py-3 text-[17px] text-black font-normal border-r border-gray-300/50 active:bg-gray-100">取消</button><button onClick={handleResetApp} className="flex-1 py-3 text-[17px] text-[#FF3B30] font-bold active:bg-gray-100">確認重置</button></div></div></div>)}
           {isCalculatorOpen && (<><div className="absolute inset-0 z-40 bg-transparent" onClick={() => setIsCalculatorOpen(false)}></div><div className="absolute inset-x-0 bottom-0 z-50 bg-black shadow-2xl animation-slide-up flex flex-col pb-[calc(env(safe-area-inset-bottom)+30px)] pt-5 px-3 h-[400px] rounded-t-[24px]"><div className="grid grid-cols-4 gap-2 h-full"><button onClick={() => handleCalcInput('AC')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors">AC</button><button onClick={() => handleCalcInput('DEL')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors"><Delete className="w-6 h-6" /></button><button onClick={() => handleCalcInput('%')} className="h-full rounded-xl bg-white text-black text-xl font-bold active:bg-gray-200 flex items-center justify-center transition-colors">%</button><button onClick={() => handleCalcInput('/')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">÷</button><button onClick={() => handleCalcInput('7')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">7</button><button onClick={() => handleCalcInput('8')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">8</button><button onClick={() => handleCalcInput('9')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">9</button><button onClick={() => handleCalcInput('*')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pt-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">×</button><button onClick={() => handleCalcInput('4')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">4</button><button onClick={() => handleCalcInput('5')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">5</button><button onClick={() => handleCalcInput('6')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">6</button><button onClick={() => handleCalcInput('-')} className="h-full rounded-xl bg-black border border-white/20 text-white text-3xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">-</button><button onClick={() => handleCalcInput('1')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">1</button><button onClick={() => handleCalcInput('2')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">2</button><button onClick={() => handleCalcInput('3')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">3</button><button onClick={() => handleCalcInput('+')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold pb-0.5 active:bg-gray-800 flex items-center justify-center transition-colors">+</button><button onClick={() => handleCalcInput('0')} className="col-span-2 h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center pl-6 transition-colors">0</button><button onClick={() => handleCalcInput('.')} className="h-full rounded-xl bg-white text-black text-2xl font-semibold active:bg-gray-200 flex items-center justify-center transition-colors">.</button><button onClick={() => handleCalcInput('=')} className="h-full rounded-xl bg-black border border-white/20 text-white text-2xl font-bold active:bg-gray-800 flex items-center justify-center transition-colors">=</button></div></div></>)}
          <div className={scrollContainerClasses}>
            {activeTab === 'dashboard' && renderDashboardView()}
            {activeTab === 'history' && renderHistoryView()}
            {activeTab === 'form' && renderFormView()}
            {activeTab === 'investment' && renderInvestmentView()}
            {activeTab === 'settings' && renderSettingsView()}
          </div>
          <div className="flex-none bg-white/95 backdrop-blur-xl border-t border-gray-200 pb-[calc(env(safe-area-inset-bottom)+5px)] pt-2 px-2 flex justify-around items-center z-30">
            <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}><PieChart className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-[10px] font-bold">總覽</span></button>
            <button onClick={() => { setActiveTab('history'); setFilterCategory(null); }} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'history' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}><List className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-[10px] font-bold">明細</span></button>
            <div className="relative -top-6"><button onClick={handleFabClick} className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform ${activeTab === 'form' && !editingId ? 'bg-gray-900 rotate-45' : 'bg-black'}`}><Plus className="w-7 h-7" strokeWidth={3} /></button></div>
            <button onClick={() => setActiveTab('investment')} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'investment' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}><TrendingUp className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-[10px] font-bold">投資</span></button>
            <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center justify-center w-20 h-14 rounded-2xl transition-all duration-200 ${activeTab === 'settings' ? 'bg-gray-100 text-black' : 'text-gray-400 hover:bg-gray-50'}`}><Settings className="w-6 h-6 mb-0.5" strokeWidth={2.5} /><span className="text-[10px] font-bold">設定</span></button>
          </div>
        </div>
      </div>
    </>
  );
}